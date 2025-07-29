const express = require('express');
const app = express();
const path = require("path");
const env = require("dotenv").config();
const session = require("express-session");
const db = require("./config/db");
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const passport = require('./config/passport');
// const User = require('./models/userSchema');
db();

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static('public'));

app.use(session({
    secret : process.env.SESSION_SECRET,
    resave : false,
    saveUninitialized : false,
    cookie : {
        secure : false,
        httpOnly : true,
        maxAge : 72*60*60*1000
    }
}))


app.use(passport.initialize());
app.use(passport.session());


// app.use(async (req, res, next) => {
//     try {
//         if (req.user) {
//             // Passport user
//             res.locals.user = req.user;
//         } else if (req.session.user) {
//             // Manual session user
//             console.log("Session user:", req.session.user);
//             const user = await User.findById(req.session.user);
//             res.locals.user = user;
//             console.log("local user:", res.locals.user);

//         } else {
//             res.locals.user = null;
//         }
//     } catch (err) {
//         console.error("Error setting res.locals.user", err);
//         res.locals.user = null;
//     }
//     next();
// });


app.use((req,res,next) => {
    res.set('cache-control','no-store')
    next();
})

app.set("view engine","ejs");
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])


app.use('/',userRouter);
app.use('/admin',adminRouter);


app.listen(process.env.PORT, () => console.log("Server started..."));



module.exports = app;