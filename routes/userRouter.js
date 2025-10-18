const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/userController")
const productController = require("../controllers/user/productController")
const profileController = require("../controllers/user/profileController")
const addressController = require("../controllers/user/addressController")
const cartController = require("../controllers/user/cartController")
const wishlistController = require("../controllers/user/wishlistController")
const checkoutController = require("../controllers/user/checkoutController")
const orderController = require("../controllers/user/orderController");
const walletController = require("../controllers/user/walletController");
const couponController = require("../controllers/user/couponController");
const reviewController = require("../controllers/user/reviewController");


const { userAuth, cartCount, wishlistCount } = require("../middlewares/auth");
const upload = require('../middlewares/multer');
const { userErrorHandler } = require("../middlewares/errorHandler");
const checkUserBlocked  = require("../middlewares/checkUserBlocked");


router.use(cartCount, wishlistCount)

router.get('/', userController.loadHomepage);
router.get('/pageNotFound', userController.pageNotFound);
router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verify-otp', userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', {
    successRedirect: '/',
    failureRedirect: '/signup'
}));

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout);

router.get('/forgotPassword', userController.loadForgotPassword);
router.post('/forgotPassword', userController.forgotPassword);
router.post('/forgotpassword-otp', userController.forgotPasswordOtp);
router.post('/resendForgotPasswordOtp', userController.resendForgotPasswordOtp);

router.get('/changepassword', userController.loadchangepassword);
router.post('/changepassword', userController.changepassword)

router.get('/boys', productController.loadBoysPage);
router.get("/productDetail/:id", productController.loadProductDetail);

router.get("/product-reviews/:productId", reviewController.getProductReviews);

router.use(checkUserBlocked)  

router.post('/cart/add',cartController.addToCart);

router.use(userAuth)

// profile management
router.get('/userProfile',profileController.loadUserProfile);
router.post('/userProfile/upload-photo',upload.single('profilePhoto'),profileController.uploadProfilePhoto);
router.get('/editProfile',profileController.loadeditProfile)
router.post('/updateProfile',profileController.updateUserProfile);
router.post('/updateProfile/send-otp', profileController.sendOtpForEmailChange);
router.post('/updateProfile/verify-otp', profileController.verifyOtpAndUpdateProfile);
router.get('/profile-change-password',profileController.loadchangePassword);
router.post('/profile-change-password',profileController.changePassword);

//address management
router.get('/address',addressController.loadAddressPage);
router.post("/address/save",addressController.saveAddress);
router.patch("/address/:id/default", addressController.setDefaultAddress);
router.get('/address/:id', addressController.getAddressById);
router.patch('/address/:id', addressController.updateAddress);
router.delete('/address/:id', addressController.deleteAddress);

//wishlist management
router.post("/wishlist/add", wishlistController.addToWishlist);
router.get('/wishlist', wishlistController.getWishlistPage);
router.delete('/wishlist/:productId', wishlistController.removeFromWishlist);
router.post("/wishlist/toggle", wishlistController.toggleWishlist);
router.get("/product/:id/variants", wishlistController.getVariantsByProduct);

//cart management
router.get('/cart', cartController.getCartPage);
router.post('/cart/update-quantity', cartController.updateQuantity);
router.get("/cart/remove/:productId/:variantId", cartController.removeFromCart);
router.get("/cart/validate", cartController.validateCart);

router.get('/checkout', checkoutController.getCheckoutPage);
router.get('/coupon/list', checkoutController.couponList);

//order management
router.post("/order/place", orderController.placeOrder);
router.get("/orderplaced", orderController.loadOrderPlaced);
router.get("/orders", orderController.getOrders);
router.get("/order/:id", orderController.getOrderDetail);
router.post("/order/:id/cancel", orderController.cancelOrder);
router.post("/order/:orderId/cancel-item/:itemId", orderController.cancelItem);

router.get("/order/:orderId/invoice", orderController.downloadInvoice);
router.post("/order/:orderId/return-item/:itemId", orderController.returnItem);

//wallet management
router.get("/wallet", walletController.getWalletPage);
router.post("/wallet/add", walletController.addMoney);

// Razorpay create + verify
router.post("/payment/razorpay/create",orderController.createRazorpayOrder);
router.post("/payment/razorpay/verify",orderController.verifyRazorpayPayment);

// Retry payment
router.post("/payment/razorpay/retry", orderController.retryPayment);
router.get("/order/failure/:orderId", orderController.loadOrderFailure);
router.post("/payment/razorpay/failure", orderController.razorpayFailure);

//coupon management
router.post("/coupon/apply",couponController.applyCoupon);
router.post("/coupon/remove",couponController.removeCoupon);

//review management
router.post("/review/add", reviewController.addOrEditReview);
router.get("/review/:orderId/:itemId", reviewController.getReview);

//error handler 
router.use(userErrorHandler);

module.exports = router; 