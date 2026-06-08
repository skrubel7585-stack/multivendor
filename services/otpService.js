require('dotenv').config();
const axios = require('axios');

class OTPService {
    constructor() {
        this.otpStore = new Map();
        this.isDevelopment = process.env.NODE_ENV !== 'production';
        
        console.log('=========================================');
        console.log('🚀 OTPService Initialized');
        console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔐 SMS Mode: ${this.isDevelopment ? 'CONSOLE ONLY' : 'REAL SMS'}`);
        console.log('=========================================\n');
        
        setInterval(() => this.cleanupExpiredOTPs(), 60 * 60 * 1000);
    }

    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async sendOTP(phoneNumber) {
        const otp = this.generateOTP();
        
        if (this.isDevelopment) {
            console.log('\n=========================================');
            console.log('📱 DEVELOPMENT MODE - OTP SENDING');
            console.log('=========================================');
            console.log(`📞 Phone: ${phoneNumber}`);
            console.log(`🔐 YOUR OTP IS: ${otp}`);
            console.log(`⏰ Valid for: 5 minutes`);
            console.log('=========================================\n');
            
            this.otpStore.set(phoneNumber, {
                otp: otp,
                expiresAt: Date.now() + 5 * 60 * 1000,
                attempts: 0
            });
            
            return {
                success: true,
                message: 'OTP generated (Check console for OTP)',
                debug_otp: otp
            };
        }
        
        return await this.sendRealSMS(phoneNumber, otp);
    }

    async sendRealSMS(phoneNumber, otp) {
        try {
            let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            if (cleanPhone.length === 10) {
                cleanPhone = '91' + cleanPhone;
            }
            
            // DLT রেজিস্টার্ড টেমপ্লেট অনুযায়ী এক্স্যাক্ট মেসেজ
            const templateMessage = `Use code ${otp} for verifying your mobile number with Redsms. Do not share this OTP with anyone - red web solutions`;
            const encodedMessage = encodeURIComponent(templateMessage);
            
            // টেমপ্লেট আইডি সহ URL
            const url = `${process.env.REDSMS_BASE_URL}?key=${process.env.REDSMS_API_KEY}&route=${process.env.REDSMS_ROUTE}&sender=${process.env.REDSMS_SENDER_ID}&number=${cleanPhone}&sms=${encodedMessage}&templateid=${process.env.REDSMS_TEMPLATE_ID}`;
            
            console.log('📡 Sending SMS to:', cleanPhone);
            console.log('🔑 OTP:', otp);
            console.log('📝 Template ID:', process.env.REDSMS_TEMPLATE_ID);
            console.log('🌐 URL:', url.substring(0, 200));
            
            const response = await axios.get(url, {
                timeout: 30000,
                validateStatus: false
            });
            
            const responseStr = String(response.data).trim();
            console.log('📨 Response:', responseStr);
            
            // Redsms রেসপন্স কোড ডিকোড
            const responseCodes = {
                '100': 'Invalid API Key',
                '101': 'Insufficient Balance',
                '102': 'Invalid Sender ID',
                '103': 'Invalid Template ID - Please check DLT registration',
                '104': 'Invalid Entity ID',
                '105': 'Invalid DLT Template - Content mismatch',
                '106': 'Invalid Mobile Number',
                '107': 'Invalid Message Length',
                '108': 'SUCCESS - Message sent',
                '109': 'API Key Missing',
                '110': 'Route Not Found'
            };
            
            // সাকসেস চেক করুন (108 বা সাকসেস মেসেজ)
            if (responseStr === '108' || responseStr.includes('Submitted') || responseStr.includes('Success') || responseStr.length > 5) {
                this.otpStore.set(cleanPhone, {
                    otp: otp,
                    expiresAt: Date.now() + 5 * 60 * 1000,
                    attempts: 0
                });
                
                console.log('✅ OTP sent successfully');
                return {
                    success: true,
                    message: 'OTP sent successfully to your mobile number'
                };
            } 
            
            // এরর হ্যান্ডলিং
            if (responseCodes[responseStr]) {
                console.error(`❌ Redsms Error: ${responseCodes[responseStr]}`);
                return {
                    success: false,
                    message: responseCodes[responseStr],
                    debug_code: responseStr
                };
            }
            
            // অজানা রেসপন্স
            console.error('❌ Unknown response:', responseStr);
            return {
                success: false,
                message: 'Failed to send OTP. Please try again.',
                debug_code: responseStr
            };
            
        } catch (error) {
            console.error('❌ SMS Error:', error.message);
            return {
                success: false,
                message: 'SMS service error. Please try again.'
            };
        }
    }

    verifyOTP(phoneNumber, userOTP) {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        
        const storedData = this.otpStore.get(finalPhone);
        
        if (!storedData) {
            return { 
                success: false, 
                message: 'OTP expired or not found. Please request a new OTP.' 
            };
        }
        
        if (Date.now() > storedData.expiresAt) {
            this.otpStore.delete(finalPhone);
            return { 
                success: false, 
                message: 'OTP has expired. Please request a new OTP.' 
            };
        }
        
        if (storedData.attempts >= 5) {
            this.otpStore.delete(finalPhone);
            return { 
                success: false, 
                message: 'Too many failed attempts. Please request a new OTP.' 
            };
        }
        
        if (storedData.otp === userOTP) {
            this.otpStore.delete(finalPhone);
            return { 
                success: true, 
                message: 'OTP verified successfully' 
            };
        }
        
        storedData.attempts++;
        this.otpStore.set(finalPhone, storedData);
        
        const remainingAttempts = 5 - storedData.attempts;
        return { 
            success: false, 
            message: `Invalid OTP. ${remainingAttempts} attempts remaining.`
        };
    }

    async resendOTP(phoneNumber) {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        const finalPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        
        this.otpStore.delete(finalPhone);
        return await this.sendOTP(finalPhone);
    }

    cleanupExpiredOTPs() {
        const now = Date.now();
        for (const [phone, data] of this.otpStore.entries()) {
            if (now > data.expiresAt) {
                this.otpStore.delete(phone);
            }
        }
    }

    getOTPStatus(phoneNumber) {
        const data = this.otpStore.get(phoneNumber);
        if (!data) return { exists: false };
        
        return {
            exists: true,
            expiresIn: Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000)),
            attempts: data.attempts
        };
    }

    getAllActiveOTPs() {
        const activeOTPs = [];
        for (const [phone, data] of this.otpStore.entries()) {
            activeOTPs.push({
                phone: phone,
                otp: data.otp,
                expiresIn: Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000)),
                attempts: data.attempts
            });
        }
        return activeOTPs;
    }
}

module.exports = new OTPService();