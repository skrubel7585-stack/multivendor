const OTPService = require('../services/OTPService');
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// সেন্ড OTP
const sendLoginOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone || phone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid 10-digit mobile number'
            });
        }
        
        const fullPhoneNumber = `91${phone}`;
        
        console.log(`📱 Sending OTP to: ${fullPhoneNumber}`);
        
        const result = await OTPService.sendOTP(fullPhoneNumber);
        
        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                ...(process.env.NODE_ENV !== 'production' && { debug_otp: result.debug_otp })
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to send OTP',
                debug_code: result.debug_code
            });
        }
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// ভেরিফাই OTP এবং লগইন
const verifyOTPAndLogin = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        
        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required'
            });
        }
        
        const fullPhoneNumber = `91${phone}`;
        
        const verification = OTPService.verifyOTP(fullPhoneNumber, otp);
        
        if (!verification.success) {
            return res.status(400).json({
                success: false,
                message: verification.message
            });
        }
        
        let user;
        let isNewUser = false;
        
        const [existingUser] = await db.execute(
            'SELECT * FROM users WHERE phone = ?',
            [fullPhoneNumber]
        );
        
        if (existingUser.length === 0) {
            isNewUser = true;
            const [result] = await db.execute(
                'INSERT INTO users (phone, role, created_at) VALUES (?, ?, NOW())',
                [fullPhoneNumber, 'buyer']
            );
            
            user = {
                id: result.insertId,
                phone: fullPhoneNumber,
                role: 'buyer'
            };
        } else {
            user = existingUser[0];
        }
        
        const accessToken = jwt.sign(
            { 
                id: user.id, 
                phone: user.phone, 
                role: user.role 
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );
        
        const refreshToken = jwt.sign(
            { id: user.id },
            process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
            { expiresIn: '30d' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: user.id,
                    phone: user.phone,
                    role: user.role,
                    isNewUser
                }
            }
        });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// রিসেন্ড OTP
const resendOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone || phone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid phone number'
            });
        }
        
        const fullPhoneNumber = `91${phone}`;
        const result = await OTPService.resendOTP(fullPhoneNumber);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'OTP resent successfully',
                ...(process.env.NODE_ENV !== 'production' && { debug_otp: result.debug_otp })
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to resend OTP'
            });
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// OTP স্ট্যাটাস চেক
const getOTPStatus = async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number required'
            });
        }
        
        const fullPhoneNumber = `91${phone}`;
        const status = OTPService.getOTPStatus(fullPhoneNumber);
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Get OTP status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// ডিবাগিং - সব অ্যাক্টিভ OTP (শুধু ডেভেলপমেন্ট)
const getAllActiveOTPs = async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            success: false,
            message: 'Not allowed in production'
        });
    }
    
    const activeOTPs = OTPService.getAllActiveOTPs();
    res.json({
        success: true,
        data: activeOTPs
    });
};

module.exports = {
    sendLoginOTP,
    verifyOTPAndLogin,
    resendOTP,
    getOTPStatus,
    getAllActiveOTPs
};