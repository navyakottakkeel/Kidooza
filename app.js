const express = require('express');
const app = express();
const path = require("path");
require("dotenv").config();
const session = require("express-session");
const db = require("./config/db");
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const passport = require('./config/passport');

db();

console.log("Google callback URL:", process.env.GOOGLE_CALLBACK_URL);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use('/uploads/products', express.static('public/uploads/products'));

 
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {  
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000
    }
}))


app.use(passport.initialize());
app.use(passport.session());


app.use((req, res, next) => {
    res.set('cache-control', 'no-store')
    next();
})

app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')])


app.use('/admin', adminRouter);
app.use('/', userRouter);


app.listen(process.env.PORT, () => console.log("Server started..."));
