const db = require('../config/db');

// Get reviews for a product (Public)
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT 
        r.id,
        r.product_id,
        r.user_id,
        r.rating,
        r.comment,
        r.verified_purchase,
        r.helpful_count,
        r.created_at,
        COALESCE(b.full_name, u.email, 'Anonymous') as reviewer_name
      FROM reviews r
      LEFT JOIN buyers b ON r.user_id = b.user_id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND r.status = 'approved'
    `;
    
    const params = [productId];
    
    if (rating && rating !== 'null' && rating !== 'undefined') {
      query += ` AND r.rating = ?`;
      params.push(parseInt(rating));
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    const [reviews] = await db.execute(query, params);
    
    // Get stats
    const [stats] = await db.execute(
      `SELECT 
        COUNT(*) as total_reviews,
        COALESCE(ROUND(AVG(rating), 1), 0) as average_rating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as rating_5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as rating_4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as rating_3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as rating_2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as rating_1
      FROM reviews 
      WHERE product_id = ? AND status = 'approved'`,
      [productId]
    );
    
    res.json({
      success: true,
      data: {
        reviews: reviews,
        stats: {
          total: stats[0].total_reviews || 0,
          average: parseFloat(stats[0].average_rating || 0),
          distribution: {
            5: stats[0].rating_5 || 0,
            4: stats[0].rating_4 || 0,
            3: stats[0].rating_3 || 0,
            2: stats[0].rating_2 || 0,
            1: stats[0].rating_1 || 0
          }
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: stats[0].total_reviews || 0,
          totalPages: Math.ceil((stats[0].total_reviews || 0) / limit)
        }
      }
    });
    
  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add a review (Protected)
const addReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;
    
    console.log('=== ADD REVIEW DEBUG ===');
    console.log('Product ID:', productId);
    console.log('Rating:', rating);
    console.log('Comment:', comment);
    console.log('User from middleware:', req.user);
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required. Please login.' 
      });
    }
    
    const userId = req.user.id;
    
    // Validate rating
    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    // Check if product exists
    const [product] = await db.execute(
      'SELECT id FROM products WHERE id = ?',
      [productId]
    );
    
    if (product.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Check if user already reviewed this product
    const [existing] = await db.execute(
      'SELECT id FROM reviews WHERE product_id = ? AND user_id = ?',
      [productId, userId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product'
      });
    }
    
    // Check if user has purchased this product
    let verifiedPurchase = 0;
    try {
      const [purchased] = await db.execute(
        `SELECT o.id 
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ? AND oi.product_id = ? 
        AND o.status IN ('delivered', 'shipped')
        LIMIT 1`,
        [userId, productId]
      );
      verifiedPurchase = purchased.length > 0 ? 1 : 0;
    } catch (err) {
      console.log('Error checking purchase:', err.message);
    }
    
    // Insert review - NO images column
    const [result] = await db.execute(
      `INSERT INTO reviews (product_id, user_id, rating, comment, verified_purchase, status)
      VALUES (?, ?, ?, ?, ?, 'approved')`,
      [productId, userId, ratingNum, comment || null, verifiedPurchase]
    );
    
    console.log('Review inserted successfully, ID:', result.insertId);
    
    // Update product average rating
    await updateProductRating(productId);
    
    res.json({
      success: true,
      message: 'Review added successfully',
      data: { id: result.insertId }
    });
    
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a review
const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    const userId = req.user.id;
    
    const [reviews] = await db.execute(
      'SELECT product_id FROM reviews WHERE id = ? AND user_id = ?',
      [reviewId, userId]
    );
    
    if (reviews.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }
    
    await db.execute('DELETE FROM reviews WHERE id = ?', [reviewId]);
    
    // Update product rating
    await updateProductRating(reviews[0].product_id);
    
    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark review as helpful
const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;
    
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    const userId = req.user.id;
    
    // Check if user already marked this review
    const [existing] = await db.execute(
      'SELECT id FROM review_helpful WHERE review_id = ? AND user_id = ?',
      [reviewId, userId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You already marked this review as helpful'
      });
    }
    
    await db.execute(
      'INSERT INTO review_helpful (review_id, user_id) VALUES (?, ?)',
      [reviewId, userId]
    );
    
    await db.execute(
      'UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?',
      [reviewId]
    );
    
    res.json({
      success: true,
      message: 'Marked as helpful'
    });
    
  } catch (error) {
    console.error('Mark helpful error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to update product average rating
async function updateProductRating(productId) {
  try {
    const [result] = await db.execute(
      `SELECT 
        COALESCE(AVG(rating), 0) as avg_rating,
        COUNT(*) as review_count
      FROM reviews 
      WHERE product_id = ? AND status = 'approved'`,
      [productId]
    );
    
    await db.execute(
      'UPDATE products SET avg_rating = ?, review_count = ? WHERE id = ?',
      [result[0].avg_rating, result[0].review_count, productId]
    );
    
    console.log(`Updated product ${productId} rating: ${result[0].avg_rating}, count: ${result[0].review_count}`);
  } catch (error) {
    console.error('Error updating product rating:', error);
  }
}

module.exports = {
  getProductReviews,
  addReview,
  deleteReview,
  markReviewHelpful
};