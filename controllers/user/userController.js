const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Wallet = require("../../models/walletSchema");
const { creditMoney } = require("../user/walletController");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt");
const HTTP_STATUS = require("../../constants/httpStatus");


// -------------------------- Load Home page --------------------------------------------

const loadHomepage = async (req, res, next) => {
    try {
        const user = req.user || (req.session.user && await User.findById(req.session.user));

        const categories = await Category.find({ isDeleted: false });
        const allProducts = await Product.find({ isBlock: false }).sort({ createdAt: -1 }).limit(4);

        const categorizedProducts = {};
        categories.forEach(category => {
            categorizedProducts[category._id] = allProducts.filter(
                product => product.category.toString() === category._id.toString()
            );
        });

        res.locals.user = user;
        return res.status(HTTP_STATUS.OK).render("home", { categories, allProducts, categorizedProducts });

    } catch (error) {
        return next(error);
    }
};


// -------------------------- Load Signup --------------------------------------------

const loadSignup = async (req, res, next) => {
    try {
        return res.status(HTTP_STATUS.OK).render("signup");
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Load Login --------------------------------------------

const loadLogin = async (req, res, next) => {
    try {
        if (!req.session.user) {
            return res.status(HTTP_STATUS.OK).render("login");
        } else {
            return res.redirect('/');
        }
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Signup --------------------------------------------

const signup = async (req, res, next) => {
    try {
        const { name, phone, email, password, cpassword, referralCode } = req.body;

        if (password !== cpassword) {
            const error = new Error("Passwords do not match");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        if (await User.findOne({ email })) {
            const error = new Error("Email already exists");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        if (await User.findOne({ phone })) {
            const error = new Error("Mobile number already exists");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            const error = new Error("Failed to send OTP email");
            error.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw error;
        }

        req.session.userOtp = otp;
        console.log(otp);
        req.session.userData = { name, phone, email, password, referralCode };

        return res.status(HTTP_STATUS.OK).render("verify-otp", { userData: req.session.userData });

    } catch (error) {
        return next(error);
    }
};

// -------------------------- Helper function Generate Otp ----------------------------------

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ------------------- Helper function Send Verification Email ---------------------------

async function sendVerificationEmail(email, otp) {
    try {

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your OTP for account verification is ${otp}. Use it within 5 minutes.`,
            html: `
            <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
              <p>Dear User,</p>
              <p>Your OTP for account verification is:</p>
              <div style="font-size: 24px; font-weight: bold; margin: 10px 0;">${otp}</div>
              <p>Please use this code within 5 minutes.</p>
              <br>
              <p>Thanks,<br>The Kidooza Team</p>
            </div>
          `
        })


        return info.accepted.length > 0

    } catch (error) {
        next(error);
    }
}

// -------------------------- Secure Password --------------------------------------------

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;

    } catch (error) {
        next(error);
    }
}

// -------------------------- Verify Otp --------------------------------------------

const verifyOtp = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const referralCode = req.session.userData?.referralCode;

        if (otp !== req.session.userOtp) {
            const error = new Error("Invalid OTP");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const userData = req.session.userData;
        const passwordHash = await securePassword(userData.password);

        let newReferralCode;
        while (true) {
            newReferralCode = generateReferralCode();
            if (!await User.findOne({ referalcode: newReferralCode })) break;
        }

        const newUser = await User.create({
            name: userData.name,
            email: userData.email,
            phone: userData.phone,
            password: passwordHash,
            referalcode: newReferralCode,
            redeemed: false,
        });

        if (referralCode?.trim()) {
            const refUser = await User.findOneAndUpdate(
                { referalcode: referralCode },
                { $push: { redeemedUsers: newUser._id } },
                { new: true }
            );

            if (refUser) {
                await User.findByIdAndUpdate(newUser._id, { redeemed: true });
                await creditMoney(newUser._id, 50, "Referral signup bonus");
                await creditMoney(refUser._id, 100, "Referral reward");
            } else {
                const error = new Error("Invalid referral code");
                error.status = HTTP_STATUS.BAD_REQUEST;
                throw error;
            }
        }

        req.session.user = newUser._id;
        return res.status(HTTP_STATUS.CREATED).json({ success: true, redirectUrl: "/" });

    } catch (error) {
        return next(error);
    }
};
  

// -------------------------- Helper function Generate Referral Code ----------------------------------

function generateReferralCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// -------------------------- Resend Otp --------------------------------------------

const resendOtp = async (req, res, next) => {
    try {
        const userEmail = req.session.userData?.email;
        if (!userEmail) {
            const error = new Error("Session expired. Please sign up again.");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const newOtp = generateOtp();
        req.session.userOtp = newOtp;
        console.log(newOtp);
        await sendVerificationEmail(userEmail, newOtp);

        return res.status(HTTP_STATUS.OK).json({ success: true, message: "OTP resent successfully" });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Login --------------------------------------------

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const findUser = await User.findOne({ isAdmin: false, email });
        if (!findUser) {
            const error = new Error("User not found");
            error.status = HTTP_STATUS.NOT_FOUND;
            throw error;
        }

        if (findUser.isBlocked) {
            const error = new Error("User is blocked by Admin");
            error.status = HTTP_STATUS.FORBIDDEN;
            throw error;
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            const error = new Error("Incorrect password");
            error.status = HTTP_STATUS.UNAUTHORIZED;
            throw error;
        }

        req.session.user = findUser._id;
        return res.status(HTTP_STATUS.OK).redirect('/');
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Logout --------------------------------------------

const logout = async (req, res, next) => {
    try {
        req.session.destroy(err => {
            if (err) throw err;
            return res.redirect('/login');
        });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Load Forgot Password --------------------------------------------

const loadForgotPassword = async (req, res) => {
    try {

        return res.render("forgot-password")

    } catch (error) {
        next(error);
    }
}

// -------------------------- Forgot Password --------------------------------------------

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email });

        if (!findUser) {
            const error = new Error("Email does not exist");
            error.status = HTTP_STATUS.NOT_FOUND;
            throw error;
        }

        const otp = generateOtp();
        console.log(otp);
        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            const error = new Error("Failed to send OTP email");
            error.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw error;
        }

        req.session.forgotOtp = otp;
        req.session.userEmail = email;
        return res.status(HTTP_STATUS.OK).render("otp-forgotpassword");

    } catch (error) {
        return next(error);
    }
};


// -------------------------- Forgot Password Otp --------------------------------------------

const forgotPasswordOtp = async (req, res, next) => {
    try {
        const { otp } = req.body;

        if (otp !== req.session.forgotOtp) {
            const error = new Error("Invalid OTP");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        return res.status(HTTP_STATUS.OK).json({ success: true, redirectUrl: "/changepassword" });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Resend Forgot Password Otp --------------------------------------------

const resendForgotPasswordOtp = async (req, res, next) => {
    try {
        const userEmail = req.session.userEmail;
        if (!userEmail) {
            const error = new Error("Session expired. Please try again.");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const newOtp = generateOtp();
        req.session.forgotOtp = newOtp;
        await sendVerificationEmail(userEmail, newOtp);

        console.log(newOtp);
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "OTP resent successfully" });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Load Change Password --------------------------------------------

const loadchangepassword = async (req, res, next) => {
    try {
        return res.status(HTTP_STATUS.OK).render("change-password");
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Change Password --------------------------------------------

const changepassword = async (req, res, next) => {
    try {
        const userEmail = req.session.userEmail;
        const { password, cpassword } = req.body;

        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*!]).{8,}$/;

        if (!password || !cpassword) {
            const error = new Error("Please enter all password fields");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        if (!passwordPattern.test(password)) {
            const error = new Error("Password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        if (password !== cpassword) {
            const error = new Error("Password and confirm password do not match");
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const passwordHash = await securePassword(password);
        await User.findOneAndUpdate({ email: userEmail }, { $set: { password: passwordHash } });

        req.session.userEmail = null;
        req.session.forgotOtp = null;

        return res.status(HTTP_STATUS.OK).render("login", { message: "Password reset successful. Please login." });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Page Not Found --------------------------------------------

const pageNotFound = async (req, res, next) => {
    try {
        const user = req.user || (req.session.user && await User.findById(req.session.user));
        res.locals.user = user;
        return res.status(HTTP_STATUS.NOT_FOUND).render("page-404");
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Exports --------------------------------------------

module.exports = {
    loadHomepage,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadForgotPassword,
    forgotPassword,
    forgotPasswordOtp,
    loadchangepassword,
    resendForgotPasswordOtp,
    changepassword,
    pageNotFound
}