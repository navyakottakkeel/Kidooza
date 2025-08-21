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


const { userAuth, cartCount, wishlistCount } = require("../middlewares/auth");
const upload = require('../middlewares/multer');


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

router.get('/allProducts', productController.loadAllProducts);
router.get('/newArrivals', productController.loadNewArrivals);
router.get('/boys', productController.loadBoysPage);
router.get("/productDetail/:id", productController.loadProductDetail);


router.post('/cart/add',cartController.addToCart);

router.use(userAuth)

router.get('/userProfile',profileController.loadUserProfile);
router.post('/userProfile/upload-photo',upload.single('profilePhoto'),profileController.uploadProfilePhoto);
router.get('/editProfile',profileController.loadeditProfile)
router.post('/updateProfile',profileController.updateUserProfile);
router.post('/updateProfile/send-otp', profileController.sendOtpForEmailChange);
router.post('/updateProfile/verify-otp', profileController.verifyOtpAndUpdateProfile);
router.get('/profile-change-password',profileController.loadchangePassword);
router.post('/profile-change-password',profileController.changePassword);


router.get('/address',addressController.loadAddressPage);
router.post("/address/save",addressController.saveAddress);
router.patch("/address/:id/default", addressController.setDefaultAddress);
router.get('/address/:id', addressController.getAddressById);
router.patch('/address/:id', addressController.updateAddress);
router.delete('/address/:id', addressController.deleteAddress);

router.post("/wishlist/add", wishlistController.addToWishlist);
router.get('/wishlist', wishlistController.getWishlistPage);
router.delete('/wishlist/:productId/:variantId', wishlistController.removeFromWishlist);

router.get('/cart', cartController.getCartPage);
router.post('/cart/update-quantity', cartController.updateQuantity);
router.get("/cart/remove/:productId/:variantId", cartController.removeFromCart);

router.get('/checkout', checkoutController.getCheckoutPage);

router.post("/order/place", orderController.placeOrder);
router.get("/orderplaced", orderController.loadOrderPlaced);
router.get("/orders", orderController.getOrders);
router.get("/order/:id", orderController.getOrderDetail);
router.post("/order/:id/cancel", orderController.cancelOrder);
router.post("/order/:orderId/cancel-item/:itemId", orderController.cancelItem);

router.get("/order/:orderId/invoice", orderController.downloadInvoice);
router.post("/order/:orderId/return-item/:itemId", orderController.returnItem);





module.exports = router;