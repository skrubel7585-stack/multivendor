// controllers/authController.js (Complete Optimized Version)
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Buyer = require('../models/Buyer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Generate JWT Token
const generateToken = (userId, email, role) => {
    return jwt.sign(
        { id: userId, email, role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// Validation helper
const validateRequiredFields = (fields, res) => {
    const missingFields = [];
    for (const [key, value] of Object.entries(fields)) {
        if (!value) missingFields.push(key);
    }
    if (missingFields.length > 0) {
        return res.status(400).json({
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`
        });
    }
    return null;
};

// Register Vendor
const registerVendor = async (req, res) => {
    try {
        console.log('📝 Vendor registration request:', {
            email: req.body.email,
            company_name: req.body.company_name,
            hasPassword: !!req.body.password
        });
        
        const {
            email,
            password,
            company_name,
            gst_number,
            pan_number,
            address,
            city,
            state,
            pincode,
            phone,
            website,
            business_type
        } = req.body;

        // Validate required fields
        const validationError = validateRequiredFields(
            { email, password, company_name },
            res
        );
        if (validationError) return validationError;

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Password strength validation
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Check if user exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered. Please login or use another email.'
            });
        }

        // Create user
        console.log('👤 Creating user...');
        const userId = await User.create({
            email: email.toLowerCase(),
            password,
            role: 'vendor'
        });

        console.log(`✅ User created with ID: ${userId}`);

        // Create vendor profile
        console.log('🏢 Creating vendor profile...');
        const vendorId = await Vendor.create({
            user_id: userId,
            company_name: company_name.trim(),
            gst_number: gst_number?.toUpperCase(),
            pan_number: pan_number?.toUpperCase(),
            address,
            city,
            state,
            pincode,
            phone,
            website,
            business_type
        });

        console.log(`✅ Vendor profile created with ID: ${vendorId}`);

        // Generate token
        const token = generateToken(userId, email, 'vendor');

        // Send response
        res.status(201).json({
            success: true,
            message: 'Vendor registered successfully! Please complete your profile.',
            token,
            user: {
                id: userId,
                email: email.toLowerCase(),
                role: 'vendor',
                company_name: company_name.trim(),
                is_active: true
            }
        });
        
    } catch (error) {
        console.error('❌ Vendor registration error:', error);
        
        // Handle duplicate entry errors
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Vendor profile already exists for this user'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Register Buyer
const registerBuyer = async (req, res) => {
    try {
        console.log('📝 Buyer registration request:', {
            email: req.body.email,
            full_name: req.body.full_name,
            hasPassword: !!req.body.password
        });
        
        const {
            email,
            password,
            full_name,
            shipping_address,
            billing_address,
            city,
            state,
            pincode,
            phone,
            date_of_birth,
            preferences
        } = req.body;

        // Check if trying to send vendor data to buyer endpoint
        if (req.body.company_name && !full_name) {
            return res.status(400).json({
                success: false,
                message: '❌ You are using buyer registration endpoint. Please use /api/auth/register/vendor for vendor registration, or provide full_name for buyer registration'
            });
        }

        // Validate required fields
        const validationError = validateRequiredFields(
            { email, password, full_name },
            res
        );
        if (validationError) return validationError;

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Password strength validation
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Name validation
        if (full_name.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Full name must be at least 2 characters long'
            });
        }

        // Check if user exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered. Please login or use another email.'
            });
        }

        // Create user
        console.log('👤 Creating user for buyer...');
        const userId = await User.create({
            email: email.toLowerCase(),
            password,
            role: 'buyer',
            phone,
        });

        console.log(`✅ User created with ID: ${userId}`);

        // Create buyer profile
        console.log('👤 Creating buyer profile...');
        const buyerData = {
            user_id: userId,
            full_name: full_name.trim(),
            shipping_address: shipping_address?.trim() || null,
            billing_address: billing_address?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            pincode: pincode?.toString() || null,
            phone: phone || null,
            date_of_birth: date_of_birth || null,
            preferences: preferences || null
        };
        
        await Buyer.create(buyerData);
        console.log('✅ Buyer profile created successfully');

        // Generate token
        const token = generateToken(userId, email, 'buyer');

        // Send response
        res.status(201).json({
            success: true,
            message: 'Buyer registered successfully! Welcome aboard! 🎉',
            token,
            user: {
                id: userId,
                email: email.toLowerCase(),
                role: 'buyer',
                full_name: full_name.trim(),
                is_active: true
            }
        });
        
    } catch (error) {
        console.error('❌ Buyer registration error:', error);
        
        // Handle duplicate entry errors
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: 'Buyer profile already exists for this user'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Login User
const login = async (req, res) => {
    try {
        console.log('🔐 Login attempt:', { email: req.body.email });
        
        const { email, password } = req.body;

        // Validate inputs
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findByEmail(email.toLowerCase());
        
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is active
        if (!user.is_active) {
            console.log('⚠️ Account suspended:', email);
            return res.status(403).json({
                success: false,
                message: 'Your account has been suspended. Please contact support.'
            });
        }

        // Verify password
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        
        if (!isPasswordMatch) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate token
        const token = generateToken(user.id, user.email, user.role);

        console.log('✅ Login successful:', { email: user.email, role: user.role });

        res.json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                is_active: user.is_active
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error. Please try again later.'
        });
    }
};

// Get Current User Profile
const getMe = async (req, res) => {
    try {
        console.log('📋 Fetching profile for user:', req.user.id);
        
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        let profile = null;
        if (user.role === 'vendor') {
            profile = await Vendor.findByUserId(req.user.id);
            console.log('✅ Vendor profile fetched');
        } else if (user.role === 'buyer') {
            profile = await Buyer.findByUserId(req.user.id);
            console.log('✅ Buyer profile fetched');
        }

        res.json({
            success: true,
            data: {
                user,
                profile
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// Logout (optional - client side token removal)
const logout = async (req, res) => {
    try {
        // Since we're using JWT, logout is handled client-side
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Refresh Token
const refreshToken = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const token = generateToken(user.id, user.email, user.role);
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Change Password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        const user = await User.findByEmail(req.user.email);
        
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.update(userId, { password: hashedPassword });

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Forgot Password (Request reset)
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const user = await User.findByEmail(email.toLowerCase());
        
        if (!user) {
            // Don't reveal that user doesn't exist for security
            return res.json({
                success: true,
                message: 'If your email is registered, you will receive a password reset link'
            });
        }

        // Generate reset token (6-digit OTP for simplicity)
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store reset token in database (you'll need a password_resets table)
        await pool.execute(
            'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
            [email, resetToken]
        );

        // TODO: Send email with reset token
        console.log(`Password reset token for ${email}: ${resetToken}`);

        res.json({
            success: true,
            message: 'If your email is registered, you will receive a password reset link'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Reset Password
const resetPassword = async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;

        if (!email || !token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, token and new password are required'
            });
        }

        // Verify token
        const [rows] = await pool.execute(
            'SELECT * FROM password_resets WHERE email = ? AND token = ? AND expires_at > NOW()',
            [email, token]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Update password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.execute('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
        
        // Delete used token
        await pool.execute('DELETE FROM password_resets WHERE email = ?', [email]);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

module.exports = {
    registerVendor,
    registerBuyer,
    login,
    getMe,
    logout,
    refreshToken,
    changePassword,
    forgotPassword,
    resetPassword
};