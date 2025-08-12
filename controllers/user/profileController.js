const User = require('../../models/userSchema');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');




const loadUserProfile = async(req,res) => {
    try {

        let user = null;

        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }
                res.locals.user = user;

        res.render('user-profile');
        
    } catch (error) {
        console.log("Profile page not found");
        res.status(500).send("Server error");
    }
}

/////////////////////////////////////////////////////////////////////////////////////


const uploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        // Logged-in user
        const userId = req.user ? req.user._id : req.session.user;

        const filename = `user-${userId}-${Date.now()}.png`;
        const uploadDir = path.join(__dirname, '../../public/uploads/profile');
        const uploadPath = path.join(uploadDir, filename);

        // Ensure directory exists
        fs.mkdirSync(uploadDir, { recursive: true });

        // Resize and save
        await sharp(req.file.buffer)
            .resize(200, 200)
            .toFormat('png')
            .png({ quality: 90 })
            .toFile(uploadPath);

        // Update user document
        await User.findByIdAndUpdate(userId, { profilePhoto: filename });

        res.redirect('/userProfile');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error uploading image');
    }
};

////////////////////////////////////////////////////////////////////////////////////////


const loadeditProfile = async(req,res) => {
    try {

        let user = null;

        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }
            res.locals.user = user;

        res.render('edit-profile');
        
    } catch (error) {
        console.log("Edit Profile page not found");
        res.status(500).send("Server error");
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////


const updateUserProfile = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : req.session.user;
        let updateData = {
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone
        };

        await User.findByIdAndUpdate(userId, updateData);

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error updating profile' });
    }
};


/////////////////////////////////////////////////////////////////////////////////////////////


const sendOtpForEmailChange = async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save details + OTP in session
        req.session.pendingProfileUpdate = { name, email, phone, otp };
        
        // Send OTP via email
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

        res.json({ message: 'OTP sent to email' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error sending OTP' });
    }
};

/////////////////////////////////////////////////////////////////////////////////////////////////

const verifyOtpAndUpdateProfile = async (req, res) => {
    try {
        const { name, email, phone, otp } = req.body;
        const sessionData = req.session.pendingProfileUpdate;

        if (!sessionData) {
            return res.status(400).json({ message: 'No pending update found' });
        }

        if (sessionData.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        const userId = req.user ? req.user._id : req.session.user;
        await User.findByIdAndUpdate(userId, {
            name: sessionData.name,
            email: sessionData.email,
            phone: sessionData.phone
        });

        delete req.session.pendingProfileUpdate;
        res.json({ message: 'Profile updated successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error verifying OTP' });
    }
};


///////////////////////////////////////////////////////////////////////////////////////////////

const loadchangePassword = async (req,res) => {
    try {
        let user = null;

        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }
            res.locals.user = user;

        res.render('profile-changepassword');
        
    } catch (error) {
        console.log("Edit Profile page not found");
        res.status(500).send("Server error");
    }
}
//////////////////////////////////////////////////////////////////////////////////////////////

const changePassword = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : req.session.user;
        const { currentPassword, newPassword, confirmPassword } = req.body;

         // Check empty fields
         if (!currentPassword) {
            return res.status(400).json({ success: false, message: "Please enter your current password" });
        }
        if (!newPassword) {
            return res.status(400).json({ success: false, message: "Please enter a new password" });
        }
        if (!confirmPassword) {
            return res.status(400).json({ success: false, message: "Please confirm your new password" });
        }

        const user = await User.findById(userId);

        // Check current password match
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        // Password strength check
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*!]).{8,}$/;
        if (!passwordPattern.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character."
            });
        }

        // New and confirm match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "New password and confirm password do not match" });
        }

        // Hash and save
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        req.session.destroy(() => {
            res.json({ message: 'Password updated. Please log in again.' });
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
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