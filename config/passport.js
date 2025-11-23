const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
require("dotenv").config();

console.log("Google callback URL:", process.env.GOOGLE_CALLBACK_URL);
console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID);

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {

                let user = await User.findOne({ email: profile.emails[0].value });

                if (user) {
                    if (!user.googleId) {
                        user.googleId = profile.id;
                        await user.save();
                    }
                    return done(null, user);
                }

                // Generate unique referral code
                let newReferralCode;
                while (true) {
                    newReferralCode = generateReferralCode();
                    const existing = await User.findOne({ referalcode: newReferralCode });
                    if (!existing) break;
                }

                const newUser = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    referalcode: newReferralCode,
                    redeemed: false,
                });

                await newUser.save();

                return done(null, newUser);
            } catch (err) {
                console.error("❌ Google Auth Error:", err.message, err);
                return done(err, null);
            }
        }
    )
);

function generateReferralCode(length = 6) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}



passport.serializeUser((user, done) => {
    done(null, user.id)
});

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then(user => {
            done(null, user)
        })
        .catch(err => {
            done(err, null)
        })
})



module.exports = passport;