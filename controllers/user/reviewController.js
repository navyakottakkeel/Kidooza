const Review = require("../../models/reviewSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const HTTP_STATUS = require("../../constants/httpStatus");


//------------------Add or update a review -----------------------

const addOrEditReview = async (req, res, next) => {
  try {
    const { orderId, itemId, rating, reviewText } = req.body;
    const userId = req.user ? req.user._id : req.session.user;

    if (!userId) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json({ success: false, message: "User not logged in" });
    }

    if (!orderId || !itemId || !rating) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Missing required fields" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Order not found" });
    }

    const item = order.orderedItems.id(itemId);
    if (!item) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Order item not found" });
    }

    // Check for existing review
    let review = await Review.findOne({
      user: userId,
      product: item.product,
      order: orderId,
    });

    if (review) {
      // Update existing review
      review.rating = rating;
      review.reviewText = reviewText;
      await review.save();

      return res
        .status(HTTP_STATUS.OK)
        .json({ success: true, message: "Review updated successfully" });
    } else {
      // Create new review
      const newReview = new Review({
        user: userId,
        product: item.product,
        order: orderId,
        rating,
        reviewText,
      });

      await newReview.save();

      return res
        .status(HTTP_STATUS.CREATED)
        .json({ success: true, message: "Review submitted successfully" });
    }
  } catch (error) {
    next(error);
  }
};


//----------- Get existing review for a specific order item -----------------

const getReview = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.user ? req.user._id : req.session.user;

    if (!userId) {
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json({ success: false, message: "User not logged in" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Order not found" });
    }

    const item = order.orderedItems.id(itemId);
    if (!item) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Order item not found" });
    }

    const review = await Review.findOne({
      user: userId,
      product: item.product,
      order: orderId,
    });

    return res.status(HTTP_STATUS.OK).json({ success: true, review });
  } catch (err) {
    next(err);
  }
};


// -------------------- Get Reviews for a Product -------------------------

const getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "Product not found" });
    }

    const reviews = await Review.find({ product: productId })
      .populate("user", "name") 
      .sort({ createdAt: -1 });

    return res
      .status(HTTP_STATUS.OK)
      .json({ success: true, reviews });
  } catch (error) {
    console.error("Error fetching reviews:", error);

    next(error);
  }
};
  

module.exports = { 
    addOrEditReview, 
    getReview,
    getProductReviews 
};
