const axios = require('axios');
const crypto = require('crypto');

class OTPService {
    constructor() {
        // Redsms API Credentials - এখানে আপনার রিয়েল ক্রেডেনশিয়াল দিন
        this.apiKey = 'ea89b1b2af1901728725462462ecc7ea'; // আপনার API Key
        this.senderId = 'REDSMS'; // আপনার Sender ID
        this.templateId = '1207176466192622001'; // আপনার Template ID
        this.entityId = '1201159029656817751'; // আপনার Entity ID
        this.baseUrl = 'http://login.redsms.in/api/smsapi';
        this.route = '2';
        
        // OTP স্টোর করার জন্য (প্রোডাকশনে ডাটাবেস বা রেডিস ব্যবহার করুন)
        this.otpStore = new Map();
        
        // প্রতি ঘন্টায় পুরনো OTP মুছে ফেলা
        setInterval(() => this.cleanupExpiredOTPs(), 60 * 60 * 1000);
    }

    // র‍্যান্ডম OTP জেনারেট
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // ডেভেলপমেন্টে শুধু কনসোল দেখাবে
    async sendOTPDevelopment(phoneNumber, otp) {
        console.log('=========================================');
        console.log('📱 DEVELOPMENT MODE - OTP SENDING');
        console.log('=========================================');
        console.log(`📞 Phone Number: ${phoneNumber}`);
        console.log(`🔐 Your OTP is: ${otp}`);
        console.log(`⏰ OTP Valid for: 5 minutes`);
        console.log('=========================================');
        
        // রিয়েল SMS API কল না করে ডামি রেসপন্স রিটার্ন
        return {
            success: true,
            message: 'OTP generated successfully (Development Mode)',
            otp: otp,
            isDevelopment: true
        };
    }

    // প্রোডাকশনে রিয়েল SMS পাঠানো
    async sendOTPProduction(phoneNumber, otp) {
        try {
            // বাংলা বা ইংরেজি মেসেজ
            const message = `Use code ${otp} for verifying your mobile number. Do not share this OTP with anyone - Redsms`;
            const encodedMessage = encodeURIComponent(message);
            
            const url = `${this.baseUrl}?key=${this.apiKey}&route=${this.route}&sender=${this.senderId}&number=${phoneNumber}&sms=${encodedMessage}&templateid=${this.templateId}`;
            
            console.log('📤 Sending SMS to:', phoneNumber);
            console.log('🔑 OTP:', otp);
            console.log('🌐 URL:', url);
            
            const response = await axios.get(url, {
                timeout: 10000, // 10 সেকেন্ড টাইমআউট
                validateStatus: false // সব স্ট্যাটাস কোড গ্রহণ
            });
            
            console.log('📨 Redsms API Response:', response.data);
            
            // API রেসপন্স চেক করা (Redsms এর রেসপন্স ফরম্যাট অনুযায়ী)
            if (response.data && response.data.includes('SUCCESS')) {
                return {
                    success: true,
                    message: 'OTP sent successfully',
                    response: response.data
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to send OTP - API Error',
                    error: response.data
                };
            }
        } catch (error) {
            console.error('❌ Error sending OTP:', error.message);
            return {
                success: false,
                message: 'Failed to send OTP. Please try again.',
                error: error.message
            };
        }
    }

    // মেইন সেন্ড OTP ফাংশন - এনভায়রনমেন্ট অনুযায়ী কাজ করে
    async sendOTP(phoneNumber) {
        const otp = this.generateOTP();
        
        // চেক করুন কোন এনভায়রনমেন্টে আছেন
        const isDevelopment = process.env.NODE_ENV !== 'production';
        
        let result;
        if (isDevelopment) {
            result = await this.sendOTPDevelopment(phoneNumber, otp);
        } else {
            result = await this.sendOTPProduction(phoneNumber, otp);
        }
        
        // OTP সংরক্ষণ করুন (শুধু যদি সফল হয় অথবা ডেভেলপমেন্টে)
        if (result.success) {
            this.otpStore.set(phoneNumber, {
                otp: otp,
                expiresAt: Date.now() + 5 * 60 * 1000,
                attempts: 0,
                createdAt: new Date().toISOString()
            });
        }
        
        return result;
    }

    // OTP ভেরিফাই করা
    verifyOTP(phoneNumber, userOTP) {
        const storedData = this.otpStore.get(phoneNumber);
        
        if (!storedData) {
            return {
                success: false,
                message: 'OTP expired or not found. Please request a new OTP.'
            };
        }
        
        // চেক করুন OTP এক্সপায়ার হয়েছে কিনা
        if (Date.now() > storedData.expiresAt) {
            this.otpStore.delete(phoneNumber);
            return {
                success: false,
                message: 'OTP has expired. Please request a new OTP.'
            };
        }
        
        // চেক করুন কয়বার ভুল চেষ্টা হয়েছে
        if (storedData.attempts >= 5) {
            this.otpStore.delete(phoneNumber);
            return {
                success: false,
                message: 'Too many failed attempts. Please request a new OTP.'
            };
        }
        
        // OTP মিলিয়ে দেখুন
        if (storedData.otp === userOTP) {
            this.otpStore.delete(phoneNumber);
            return {
                success: true,
                message: 'OTP verified successfully'
            };
        }
        
        // ভুল OTP - চেষ্টা সংখ্যা বাড়ান
        storedData.attempts++;
        this.otpStore.set(phoneNumber, storedData);
        
        return {
            success: false,
            message: `Invalid OTP. ${5 - storedData.attempts} attempts remaining.`,
            remainingAttempts: 5 - storedData.attempts
        };
    }

    // OTP রিসেন্ড করা
    async resendOTP(phoneNumber) {
        // পুরনো OTP ডিলিট করুন
        this.otpStore.delete(phoneNumber);
        // নতুন OTP পাঠান
        return await this.sendOTP(phoneNumber);
    }

    // পুরনো OTP ক্লিনআপ করুন
    cleanupExpiredOTPs() {
        const now = Date.now();
        let deletedCount = 0;
        
        for (const [phone, data] of this.otpStore.entries()) {
            if (now > data.expiresAt) {
                this.otpStore.delete(phone);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} expired OTPs. Current store size: ${this.otpStore.size}`);
        }
    }

    // OTP স্ট্যাটাস চেক করুন
    getOTPStatus(phoneNumber) {
        const storedData = this.otpStore.get(phoneNumber);
        if (!storedData) {
            return { exists: false };
        }
        
        return {
            exists: true,
            expiresIn: Math.max(0, Math.floor((storedData.expiresAt - Date.now()) / 1000)),
            attempts: storedData.attempts,
            createdAt: storedData.createdAt
        };
    }

    // ডিবাগিং এর জন্য সব OTP দেখা (শুধু ডেভেলপমেন্টে)
    getAllActiveOTPs() {
        const activeOTPs = [];
        for (const [phone, data] of this.otpStore.entries()) {
            activeOTPs.push({
                phone: phone,
                otp: data.otp,
                expiresIn: Math.floor((data.expiresAt - Date.now()) / 1000),
                attempts: data.attempts
            });
        }
        return activeOTPs;
    }
}

module.exports = new OTPService();