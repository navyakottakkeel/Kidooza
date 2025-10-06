const User = require('../../models/userSchema');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const HTTP_STATUS = require("../../constants/httpStatus");


// -------------------------- Load User Profile --------------------------------------------

const loadUserProfile = async (req, res, next) => {
    try {
        const user = req.user || (req.session.user && await User.findById(req.session.user));
        res.locals.user = user;
        return res.status(HTTP_STATUS.OK).render('user-profile');
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Upload Profile Photo --------------------------------------------

const uploadProfilePhoto = async (req, res, next) => {
    try {
        if (!req.file) {
            const error = new Error('No file uploaded');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const userId = req.user?._id || req.session.user;
        const filename = `user-${userId}-${Date.now()}.png`;
        const uploadDir = path.join(__dirname, '../../public/uploads/profile');
        const uploadPath = path.join(uploadDir, filename);

        fs.mkdirSync(uploadDir, { recursive: true });

        await sharp(req.file.buffer)
            .resize(200, 200)
            .toFormat('png')
            .png({ quality: 90 })
            .toFile(uploadPath);

        await User.findByIdAndUpdate(userId, { profilePhoto: filename });
        return res.status(HTTP_STATUS.OK).redirect('/userProfile');
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Load edit Profile --------------------------------------------

const loadeditProfile = async (req, res, next) => {
    try {
        const user = req.user || (req.session.user && await User.findById(req.session.user));
        res.locals.user = user;
        return res.status(HTTP_STATUS.OK).render('edit-profile');
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Update User Profile --------------------------------------------

const updateUserProfile = async (req, res, next) => {
    try {
        const userId = req.user?._id || req.session.user;
        const updateData = {
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone
        };
        await User.findByIdAndUpdate(userId, updateData);
        return res.status(HTTP_STATUS.OK).json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- send Otp For Email Change --------------------------------------------

const sendOtpForEmailChange = async (req, res, next) => {
    try {
        const { name, email, phone } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        req.session.pendingProfileUpdate = { name, email, phone, otp };

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: { user: process.env.NODEMAILER_EMAIL, pass: process.env.NODEMAILER_PASSWORD }
        });

        await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Verify your new email',
            text: `Your OTP is ${otp}`
        });

        return res.status(HTTP_STATUS.OK).json({ message: 'OTP sent to email' });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- verify Otp And Update Profile --------------------------------------------

const verifyOtpAndUpdateProfile = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const sessionData = req.session.pendingProfileUpdate;

        if (!sessionData) {
            const error = new Error('No pending update found');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        if (sessionData.otp !== otp) {
            const error = new Error('Invalid OTP');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const userId = req.user?._id || req.session.user;
        await User.findByIdAndUpdate(userId, {
            name: sessionData.name,
            email: sessionData.email,
            phone: sessionData.phone
        });

        delete req.session.pendingProfileUpdate;
        return res.status(HTTP_STATUS.OK).json({ message: 'Profile updated successfully' });
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Load change Password --------------------------------------------

const loadchangePassword = async (req, res, next) => {
    try {
        const user = req.user || (req.session.user && await User.findById(req.session.user));
        res.locals.user = user;
        return res.status(HTTP_STATUS.OK).render('profile-changepassword');
    } catch (error) {
        return next(error);
    }
};

// -------------------------- Change Password --------------------------------------------

const changePassword = async (req, res, next) => {
    try {
        const userId = req.user?._id || req.session.user;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            const error = new Error('All password fields are required');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const user = await User.findById(userId);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            const error = new Error('Current password is incorrect');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*!]).{8,}$/;
        if (!passwordPattern.test(newPassword)) {
            const error = new Error('Password must be at least 8 characters, include uppercase, lowercase, number, and special character.');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        if (newPassword !== confirmPassword) {
            const error = new Error('New password and confirm password do not match');
            error.status = HTTP_STATUS.BAD_REQUEST;
            throw error;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        req.session.destroy(() => {
            return res.status(HTTP_STATUS.OK).json({ message: 'Password updated. Please log in again.' });
        });

    } catch (error) {
        return next(error);
    }
};

/////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    loadUserProfile,
    uploadProfilePhoto,
    loadeditProfile,
    updateUserProfile,
    sendOtpForEmailChange,
    verifyOtpAndUpdateProfile,
    loadchangePassword,
    changePassword
}