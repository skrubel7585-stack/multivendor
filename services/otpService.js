const axios = require('axios');
const crypto = require('crypto');

class OTPService {
    constructor() {
        this.apiKey = 'ea89b1b2af1901728725462462ecc7ea';
        this.senderId = 'REDSMS';
        this.templateId = '1207176466192622001';
        this.entityId = '1201159029656817751';
        this.baseUrl = 'http://login.redsms.in/api/smsapi';
        this.route = '2';
        
        // Store OTPs temporarily (in production, use Redis or database)
        this.otpStore = new Map();
        
        // Clean up expired OTPs every hour
        setInterval(() => this.cleanupExpiredOTPs(), 60 * 60 * 1000);
    }

    // Generate random OTP
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Send OTP via Redsms API
    async sendOTP(phoneNumber) {
        try {
            const otp = this.generateOTP();
            const message = `Use code ${otp} for verifying your mobile number with Redsms. Do not share this OTP with anyone - red web solutions`;
            const encodedMessage = encodeURIComponent(message);
            
            const url = `${this.baseUrl}?key=${this.apiKey}&route=${this.route}&sender=${this.senderId}&number=${phoneNumber}&sms=${encodedMessage}&templateid=${this.templateId}`;
            
            console.log('Sending OTP to:', phoneNumber);
            console.log('OTP:', otp);
            
            const response = await axios.get(url);
            
            console.log('Redsms API Response:', response.data);
            
            // Store OTP with expiration (5 minutes)
            this.otpStore.set(phoneNumber, {
                otp: otp,
                expiresAt: Date.now() + 5 * 60 * 1000,
                attempts: 0
            });
            
            return {
                success: true,
                message: 'OTP sent successfully',
                otp: otp, // In production, remove this line
                response: response.data
            };
        } catch (error) {
            console.error('Error sending OTP:', error.message);
            return {
                success: false,
                message: 'Failed to send OTP',
                error: error.message
            };
        }
    }

    // Verify OTP
    verifyOTP(phoneNumber, userOTP) {
        const storedData = this.otpStore.get(phoneNumber);
        
        if (!storedData) {
            return {
                success: false,
                message: 'OTP expired or not found. Please request a new OTP.'
            };
        }
        
        if (Date.now() > storedData.expiresAt) {
            this.otpStore.delete(phoneNumber);
            return {
                success: false,
                message: 'OTP has expired. Please request a new OTP.'
            };
        }
        
        // Check attempts
        if (storedData.attempts >= 5) {
            this.otpStore.delete(phoneNumber);
            return {
                success: false,
                message: 'Too many failed attempts. Please request a new OTP.'
            };
        }
        
        if (storedData.otp === userOTP) {
            this.otpStore.delete(phoneNumber);
            return {
                success: true,
                message: 'OTP verified successfully'
            };
        }
        
        // Increment attempts
        storedData.attempts++;
        this.otpStore.set(phoneNumber, storedData);
        
        return {
            success: false,
            message: 'Invalid OTP. Please try again.',
            remainingAttempts: 5 - storedData.attempts
        };
    }

    // Resend OTP
    async resendOTP(phoneNumber) {
        // Clear existing OTP
        this.otpStore.delete(phoneNumber);
        // Send new OTP
        return await this.sendOTP(phoneNumber);
    }

    // Clean up expired OTPs
    cleanupExpiredOTPs() {
        const now = Date.now();
        for (const [phone, data] of this.otpStore.entries()) {
            if (now > data.expiresAt) {
                this.otpStore.delete(phone);
            }
        }
        console.log('Cleaned up expired OTPs. Current store size:', this.otpStore.size);
    }

    // Get OTP status for a phone number
    getOTPStatus(phoneNumber) {
        const storedData = this.otpStore.get(phoneNumber);
        if (!storedData) {
            return { exists: false };
        }
        return {
            exists: true,
            expiresIn: Math.max(0, Math.floor((storedData.expiresAt - Date.now()) / 1000)),
            attempts: storedData.attempts
        };
    }
}

module.exports = new OTPService();