const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user/userController")


router.get('/',userController.loadHomepage); 
router.get('/pageNotFound',userController.pageNotFound);
router.get('/signup',userController.loadSignup);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);


router.get('/auth/google',passport.authenticate('google',{scope : ['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{successRedirect: '/',
failureRedirect: '/signup'}));

router.get('/login',userController.loadLogin);
router.post('/login',userController.login);
router.get('/logout',userController.logout);

router.get('/forgotPassword',userController.loadForgotPassword);
router.post('/forgotPassword',userController.forgotPassword);
router.post('/forgotpassword-otp',userController.forgotPasswordOtp);
router.post('/resendForgotPasswordOtp',userController.resendForgotPasswordOtp);

router.get('/changepassword',userController.loadchangepassword);
router.post('/changepassword',userController.changepassword)

module.exports = router;