// const express = require('express');
// const router = express.Router();
// const {
//     getProductReviews,
//     addReview,
//     updateReview,
//     deleteReview,
//     markReviewHelpful,
//     getAllReviews,
//     updateReviewStatus
// } = require('../controllers/reviewController');
// const { protect, authorize } = require('../middleware/authMiddleware');

// // Public routes
// router.get('/product/:productId', getProductReviews);

// // Protected routes (Buyer only)
// router.post('/product/:productId', protect, authorize('buyer'), addReview);
// router.put('/:reviewId', protect, authorize('buyer'), updateReview);
// router.delete('/:reviewId', protect, authorize('buyer'), deleteReview);
// router.post('/:reviewId/helpful', protect, authorize('buyer'), markReviewHelpful);

// // Admin routes
// router.get('/admin/all', protect, authorize('admin'), getAllReviews);
// router.put('/admin/:reviewId/status', protect, authorize('admin'), updateReviewStatus);

// module.exports = router;

const express = require('express');
const router = express.Router();
const {
  getProductReviews,
  addReview,
  deleteReview,
  markReviewHelpful
} = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

// Public route - get reviews for a product
router.get('/product/:productId', getProductReviews);

// Protected routes - require authentication
router.post('/product/:productId', protect, addReview);
router.delete('/:reviewId', protect, deleteReview);
router.post('/:reviewId/helpful', protect, markReviewHelpful);

module.exports = router;