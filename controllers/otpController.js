const otpService = require('../services/otpService');
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Send OTP for login
const sendLoginOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone || phone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit mobile number'
            });
        }
        
        const result = await otpService.sendOTP(phone);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'OTP sent successfully',
                // In production, don't send OTP in response
                otp: process.env.NODE_ENV === 'development' ? result.otp : undefined
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP'
        });
    }
};

// Verify OTP and login/register
const verifyOTPAndLogin = async (req, res) => {
    try {
        const { phone, otp, device_token } = req.body;
        
        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required'
            });
        }
        
        // Verify OTP
        const verification = otpService.verifyOTP(phone, otp);
        
        if (!verification.success) {
            return res.status(400).json({
                success: false,
                message: verification.message,
                remainingAttempts: verification.remainingAttempts
            });
        }
        
        // Check if user exists with this phone number
        let [users] = await db.execute(
            'SELECT * FROM users WHERE phone = ?',
            [phone]
        );
        
        let userId;
        let isNewUser = false;
        
        if (users.length === 0) {
            // Create new user
            isNewUser = true;
            const defaultPassword = await bcrypt.hash(phone + Date.now(), 10);
            const [result] = await db.execute(
                `INSERT INTO users (email, password, role, phone, is_active) 
                 VALUES (?, ?, 'buyer', ?, 1)`,
                [`user_${phone}@temp.com`, defaultPassword, phone]
            );
            userId = result.insertId;
            
            // Create buyer profile
            await db.execute(
                `INSERT INTO buyers (user_id, full_name, phone) 
                 VALUES (?, ?, ?)`,
                [userId, `User_${phone}`, phone]
            );
        } else {
            userId = users[0].id;
            
            // Check if user is active
            if (users[0].is_active === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Your account has been deactivated. Please contact support.'
                });
            }
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: userId, phone: phone, role: 'buyer' },
            process.env.JWT_SECRET || 'your_secret_key',
            { expiresIn: '30d' }
        );
        
        // Update device token if provided
        if (device_token) {
            await db.execute(
                'UPDATE users SET device_token = ? WHERE id = ?',
                [device_token, userId]
            );
        }
        
        // Get user details
        const [userDetails] = await db.execute(`
            SELECT u.id, u.email, u.role, u.phone, u.is_active,
                   b.full_name, b.shipping_address, b.city, b.state
            FROM users u
            LEFT JOIN buyers b ON u.id = b.user_id
            WHERE u.id = ?
        `, [userId]);
        
        res.json({
            success: true,
            message: isNewUser ? 'Account created and logged in successfully' : 'Logged in successfully',
            token,
            isNewUser,
            user: {
                id: userDetails[0].id,
                name: userDetails[0].full_name || `User_${phone}`,
                email: userDetails[0].email,
                phone: userDetails[0].phone,
                role: userDetails[0].role,
                full_name: userDetails[0].full_name,
                shipping_address: userDetails[0].shipping_address
            }
        });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP'
        });
    }
};

// Resend OTP
const resendOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone || phone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit mobile number'
            });
        }
        
        const result = await otpService.resendOTP(phone);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'OTP resent successfully',
                otp: process.env.NODE_ENV === 'development' ? result.otp : undefined
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend OTP'
        });
    }
};

// Check OTP status
const getOTPStatus = async (req, res) => {
    try {
        const { phone } = req.query;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }
        
        const status = otpService.getOTPStatus(phone);
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Get OTP status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get OTP status'
        });
    }
};

module.exports = {
    sendLoginOTP,
    verifyOTPAndLogin,
    resendOTP,
    getOTPStatus
};