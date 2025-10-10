const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Wallet = require("../../models/walletSchema");
const { creditMoney } = require("../user/walletController");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt");


///////////////////////////////////////////////////////////////////////////////////////////////

const loadHomepage = async (req, res) => {
    try {
        let user = null;

        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        // Fetch categories (only not deleted)
        const categories = await Category.find({ isDeleted: false });

        // Fetch products (only not deleted)
        const allProducts = await Product.find({ isBlock: false })
            .sort({ createdAt: -1 })
            .limit(4);

        // Group products by category
        const categorizedProducts = {};
        categories.forEach(category => {
            categorizedProducts[category._id] = allProducts.filter(
                product => product.category.toString() === category._id.toString()
            );
        });

        res.locals.user = user;

        res.render("home", {
            categories,
            allProducts,
            categorizedProducts
        });

    } catch (error) {
       next(error);
    }
};


/////////////////////////////////////////////////////////////////////////////////////////////

const loadSignup = async (req, res) => {
    try {

        return res.render("signup")

    } catch (error) {
        next(error);
    }
}

/////////////////////////////////////////////////////////////////////////////////////////////

const loadLogin = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render("login")
        } else {
            res.redirect('/');
        }


    } catch (error) {
        next(error);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////


const signup = async (req, res) => {
    try {

        const { name, phone, email, password, cpassword,referralCode } = req.body;

        if (password !== cpassword) {
            return res.render("signup");
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render("signup", { message: "EmailId already exist" })
        }

        const findUserbyMobile = await User.findOne({ phone });
        if (findUserbyMobile) {
            return res.render("signup", { message: "Mobile Number already exist" })
        }

        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.json("email-error");
        }

        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password, referralCode };

        res.render("verify-otp", { userData: req.session.userData });
        console.log("OTP sent", otp);

    } catch (error) {
        next(error);
    }
}

//////////////////////////////

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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

///////////////////////////////////////////////////////////////////////////////////////////////

const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;

    } catch (error) {

    }
}

const verifyOtp = async (req, res) => {
    try {
      const { otp } = req.body;
      const referralCode = req.session.userData.referralCode; // fetch from session

      if (otp !== req.session.userOtp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }
  
      console.log("REF code : ",referralCode);

      const userData = req.session.userData;
      const passwordHash = await securePassword(userData.password);
  
      // Generate unique referral code
      let newReferralCode;
      while (true) {
        newReferralCode = generateReferralCode();
        const existingUser = await User.findOne({ referalcode: newReferralCode });
        if (!existingUser) break;
      }
  
      // Create new user
      const newUser = await User.create({
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        password: passwordHash,
        referalcode: newReferralCode,
        redeemed: false,
      });
  
      console.log("New user created:", newUser._id);
  
      // ✅ Referral logic
      if (referralCode && referralCode.trim() !== "") {
        console.log("Referral code received:", referralCode);
  
        const refUser = await User.findOneAndUpdate(
          { referalcode: referralCode },
          { $push: { redeemedUsers: newUser._id } },
          { new: true }
        );
  
        if (refUser) {
          await User.findByIdAndUpdate(newUser._id, { redeemed: true });
          console.log("Referral applied: ", {
            referrer: refUser._id,
            newUser: newUser._id,
          });

          // Credit wallets
        await creditMoney(newUser._id, 50, "Referral signup bonus");
        await creditMoney(refUser._id, 100, "Referral reward");

        } else {
          return res.status(400).json({ success: false, message: "Invalid referral code" });
        }
      }
  
      // Login user
      req.session.user = newUser._id;
      return res.json({ success: true, redirectUrl: "/" });
  
    } catch (error) {
        next(error);
    }
  };
  


function generateReferralCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

////////////////////////////////////////////////////////////////////////////////

const resendOtp = async (req, res) => {
    try {
        const user = req.session.userData;
        const userEmail = user.email;
        console.log(userEmail);
        if (!userEmail) {
            return res.status(400).json({ success: false, message: "Session expired. Please sign up again." });
        }

        const newOtp = generateOtp();
        req.session.userOtp = newOtp;

        await sendVerificationEmail(userEmail, newOtp);

        return res.json({ success: true, message: "OTP resent successfully" });

    } catch (err) {
        next(error);
    }
};

/////////////////////////////////////////////////////////////////////

const login = async (req, res) => {
    try {

        const { email, password } = req.body;

        const findUser = await User.findOne({ isAdmin: false, email: email });
        if (!findUser) {
            return res.render("login", { message: "User not found" });
        }
        if (findUser.isBlocked) {
            return res.render("login", { message: "User is blocked by Admin" });
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render("login", { message: "Incorrect Password" });
        }

        req.session.user = findUser._id;
        console.log("Session set for user:", req.session.user);
        res.redirect('/');

    } catch (error) {
        next(error);

    }
}

//////////////////////////////////////////////////////////////////////

const logout = async (req, res) => {
    try {

        req.session.destroy((err) => {
            if (err) {
                console.log("Error Occured ", err);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/login');
        })

    } catch (error) {
        next(error);
    }
}

/////////////////////////////////////////////////////////////////////

const loadForgotPassword = async (req, res) => {
    try {

        return res.render("forgot-password")

    } catch (error) {
        next(error);
    }
}

////////////////////////////////////////////////////////////////////

const forgotPassword = async (req, res) => {
    try {

        const { email } = req.body;
        console.log(email);
        const findUser = await User.findOne({ email: email });
        console.log(findUser);
        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (!emailSent) {
                return res.json("email-error");
            }

            req.session.forgotOtp = otp;
            req.session.userEmail = email;

            res.render("otp-forgotpassword");
            console.log("Otp sent : ", otp);
        } else {
            return res.render("forgot-password", { message: "Email not exist" });
        }


    } catch (error) {
        next(error);
    }
}


//////////////////////////////////////////////////////////////////////

const forgotPasswordOtp = async (req, res) => {
    try {

        const { otp } = req.body;
        const combineOtp = otp;
        console.log("combineotp : ", combineOtp);
        console.log("session otp : ", req.session.forgotOtp);

        if (combineOtp === req.session.forgotOtp) {
            console.log("same")
            res.json({ success: true, redirectUrl: "/changepassword" });
            // return res.render("change-password");
        } else {
            console.log("not same");
            return res.render("otp-forgotpassword", { message: "Invalid Otp" });
        }

    } catch (error) {
        next(error);
    }
}

//////////////////////////////////////////////////////////////////////

const resendForgotPasswordOtp = async (req, res) => {
    try {
        const userEmail = req.session.userEmail;
        console.log(userEmail);
        if (!userEmail) {
            return res.status(400).json({ success: false, message: "Session expired. Please sign up again." });
        }

        const newOtp = generateOtp();
        req.session.userOtp = newOtp;

        await sendVerificationEmail(userEmail, newOtp);

        return res.json({ success: true, message: "OTP resent successfully" });

    } catch (err) {
        next(error);
    }
};

/////////////////////////////////////////////////////////////////////

const loadchangepassword = async (req, res) => {
    try {

        return res.render("change-password")

    } catch (error) {
        next(error);
    }
}

//////////////////////////////////////////////////////////////////////

const changepassword = async (req, res) => {
    try {

        const userEmail = req.session.userEmail;
        const { password, cpassword } = req.body;
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*!]).{8,}$/;

        if (password === "") {
            return res.render("change-password", { message: "Please Enter Password" });
        } else if (cpassword === "") {
            return res.render("change-password", { message: "Please enter Confirm Password" });
        } else if (!passwordPattern.test(password)) {
            return res.render("change-password", { message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character." })
        } else if (password !== cpassword) {
            return res.render("change-password", { message: "Password and Confirm Password do not match" });
        }

        const passwordHash = await securePassword(password);
        const updatedUser = await User.findOneAndUpdate(
            { email: userEmail },
            { $set: { password: passwordHash } }
        );

        // Clear session values after reset
        req.session.userEmail = null;
        req.session.forgotOtp = null;

        res.render("login", { message: "Password reset successful. Please login." });

    } catch (error) {
        next(error);
    }
};


/////////////////////////////////////////////////////////////////////

const pageNotFound = async (req, res) => {
    try {

        const userId = req.user ? req.user._id : req.session.user;

        let user = null;
        if (req.user) {
          user = req.user;
        } else if (req.session.user) {
          user = await User.findById(req.session.user);
        }
    
        res.locals.user = user;
        return res.render("page-404")

    } catch (error) {
        next(error);
    }
}

//////////////////////////////////////////////////

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