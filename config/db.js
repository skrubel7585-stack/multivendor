const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

// Valid MySQL2 connection options only
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 30,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

const promisePool = pool.promise();

// Test connection
const testConnection = async () => {
    try {
        const [result] = await promisePool.execute('SELECT 1');
        console.log('✅ MySQL database connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
        return false;
    }
};

// Create all tables
const createTables = async () => {
    try {
        // ==================== CORE TABLES ====================
        
        // Users table
// Users table with phone column
await promisePool.execute(`
    CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(15) UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('vendor', 'buyer', 'admin') NOT NULL,
        is_active BOOLEAN DEFAULT true,
        suspended_reason TEXT,
        device_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_role (role),
        INDEX idx_status (is_active)
    )
`);
        console.log('✅ Users table created');

        // Vendors table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS vendors (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT UNIQUE NOT NULL,
                company_name VARCHAR(200) NOT NULL,
                gst_number VARCHAR(15),
                pan_number VARCHAR(10),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pincode VARCHAR(10),
                phone VARCHAR(15),
                website VARCHAR(200),
                business_type VARCHAR(100),
                catalog_url VARCHAR(500),
                gst_verified BOOLEAN DEFAULT FALSE,
                gst_details JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user (user_id),
                INDEX idx_city (city),
                INDEX idx_gst (gst_number)
            )
        `);
        console.log('✅ Vendors table created');

        // Buyers table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS buyers (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT UNIQUE NOT NULL,
                full_name VARCHAR(200) NOT NULL,
                shipping_address TEXT,
                billing_address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pincode VARCHAR(10),
                phone VARCHAR(15),
                date_of_birth DATE,
                preferences TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user (user_id)
            )
        `);
        console.log('✅ Buyers table created');

        // Categories table (FIRST - before subcategories)
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS categories (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                image VARCHAR(500),
                status ENUM('active', 'inactive') DEFAULT 'active',
                \`order\` INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_slug (slug),
                INDEX idx_status (status)
            )
        `);
        console.log('✅ Categories table created');



        // Subcategories table (SECOND - after categories)
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS subcategories (
                id INT PRIMARY KEY AUTO_INCREMENT,
                category_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                slug VARCHAR(100) NOT NULL,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
                UNIQUE KEY unique_category_slug (category_id, slug),
                INDEX idx_category (category_id)
            )
        `);
        console.log('✅ Subcategories table created');

       

        // Products table
await promisePool.execute(`
    CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vendor_id INT NOT NULL,
        category_id INT,
        subcategory_id INT,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(200) UNIQUE NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        compare_price DECIMAL(10,2),
        sku VARCHAR(100),
        stock INT DEFAULT 0,
        moq INT DEFAULT 1,
        delivery_time VARCHAR(50),
        image VARCHAR(500),
        images JSON,
        specifications JSON,
        machine_compatibility JSON,
        featured BOOLEAN DEFAULT FALSE,
        views INT DEFAULT 0,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        rejection_reason TEXT,
        gst DECIMAL(5,2) DEFAULT 0,
        size VARCHAR(100),
        capacity VARCHAR(100),
        city VARCHAR(100),
        brand_name VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL,
        INDEX idx_vendor (vendor_id),
        INDEX idx_status (status),
        INDEX idx_category (category_id),
        INDEX idx_price (price),
        INDEX idx_sku (sku),
        FULLTEXT idx_search (name, description)
    )
`);
console.log('✅ Products table created');

        // Orders table
        await promisePool.execute(`
    CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        commission_earned DECIMAL(10,2) DEFAULT 0,
        status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
        payment_method VARCHAR(50),
        payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        razorpay_order_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        amount DECIMAL(10,2),
        shipping_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id),
        INDEX idx_status (status),
        INDEX idx_date (created_at),
        INDEX idx_order_id (order_id)
    )
`);
        console.log('✅ Orders table created');

        // Order items table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_order (order_id),
                INDEX idx_product (product_id)
            )
        `);
        console.log('✅ Order items table created');

        // Payments table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS payments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                user_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                payment_method ENUM('card', 'upi', 'netbanking', 'cod') NOT NULL,
                transaction_id VARCHAR(100),
                status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_order (order_id),
                INDEX idx_user (user_id),
                INDEX idx_status (status)
            )
        `);
        console.log('✅ Payments table created');

        // Banners table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS banners (
                id INT PRIMARY KEY AUTO_INCREMENT,
                title VARCHAR(200),
                image VARCHAR(500) NOT NULL,
                link VARCHAR(500),
                status ENUM('active', 'inactive') DEFAULT 'active',
                \`order\` INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_status (status),
                INDEX idx_order (\`order\`)
            )
        `);
        console.log('✅ Banners table created');

        // Commission settings table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS commission_settings (
                id INT PRIMARY KEY DEFAULT 1,
                defaultRate DECIMAL(5,2) DEFAULT 10.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Commission settings table created');

        // Vendor commissions table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS vendor_commissions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                vendor_id INT UNIQUE NOT NULL,
                commission_rate DECIMAL(5,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Vendor commissions table created');

        // Commission payments table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS commission_payments (
                id INT PRIMARY KEY AUTO_INCREMENT,
                vendor_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                transaction_id VARCHAR(100),
                status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_vendor (vendor_id),
                INDEX idx_status (status)
            )
        `);
        console.log('✅ Commission payments table created');

        // Reviews table
        // await promisePool.execute(`
        //     CREATE TABLE IF NOT EXISTS reviews (
        //         id INT PRIMARY KEY AUTO_INCREMENT,
        //         product_id INT NOT NULL,
        //         user_id INT NOT NULL,
        //         rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        //         comment TEXT,
        //         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        //         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        //         FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        //         FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        //         INDEX idx_product (product_id),
        //         INDEX idx_user (user_id),
        //         INDEX idx_rating (rating)
        //     )
        // `);
        console.log('✅ Reviews table created');
await promisePool.execute(`
    ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS avg_rating DECIMAL(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0
`);

await promisePool.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        product_id INT NOT NULL,
        user_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        images JSON,
        verified_purchase BOOLEAN DEFAULT FALSE,
        helpful_count INT DEFAULT 0,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        admin_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_product (product_id),
        INDEX idx_user (user_id),
        INDEX idx_rating (rating),
        INDEX idx_status (status),
        INDEX idx_verified (verified_purchase)
    )
`);
console.log('✅ Reviews table created');

// Review helpful votes table
await promisePool.execute(`
    CREATE TABLE IF NOT EXISTS review_helpful (
        id INT PRIMARY KEY AUTO_INCREMENT,
        review_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_review_user (review_id, user_id)
    )
`);
        // Notifications table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                user_type ENUM('vendor', 'buyer', 'admin') NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                type ENUM('order', 'inventory', 'vendor', 'system') DEFAULT 'system',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user (user_id, user_type),
                INDEX idx_read (is_read),
                INDEX idx_created (created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Notifications table created');

        // Password resets table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT PRIMARY KEY AUTO_INCREMENT,
                email VARCHAR(100) NOT NULL,
                token VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (email),
                INDEX idx_token (token)
            )
        `);
        console.log('✅ Password resets table created');

        // System settings table
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS system_settings (
                id INT PRIMARY KEY DEFAULT 1,
                settings JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ System settings table created');

        // ==================== DEFAULT DATA ====================
        
        // Insert default commission if not exists
        await promisePool.execute(`
            INSERT INTO commission_settings (id, defaultRate) 
            VALUES (1, 10) 
            ON DUPLICATE KEY UPDATE id=id
        `);

        // Insert default system settings
        await promisePool.execute(`
            INSERT INTO system_settings (id, settings) 
            VALUES (1, JSON_OBJECT(
                'siteName', 'MultiVendor E-commerce',
                'siteEmail', 'admin@multivendor.com',
                'contactPhone', '+91 1234567890',
                'address', 'Your Business Address Here',
                'currency', 'INR',
                'currencySymbol', '₹'
            )) ON DUPLICATE KEY UPDATE id = id
        `);

        // Create admin user if not exists
        const [adminCount] = await promisePool.execute('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
        if (adminCount[0].count === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await promisePool.execute(`
                INSERT INTO users (email, password, role, is_active) 
                VALUES (?, ?, 'admin', 1)
            `, ['admin@multivendor.com', hashedPassword]);
            console.log('✅ Default admin user created: admin@multivendor.com / admin123');
        }

        console.log('✅ All tables created successfully!');
    } catch (error) {
        console.error('Error creating tables:', error);
    }
};

// Initialize database
const initDatabase = async () => {
    const connected = await testConnection();
    if (connected) {
        await createTables();
    }
};

initDatabase();

module.exports = promisePool;