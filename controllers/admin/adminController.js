const User = require("../../models/userSchema");
const mongoose = require('mongoose');
const bcrypt = require("bcrypt");

////////////////////////////////////////////////////////////////

const loadLogin = (req,res) =>{
    if(req.session.admin){
        return res.redirect('/admin/dashboard');
    }else{
        res.render("admin-login",{message:null});
    }
}

/////////////////////////////////////////////////////////////////

const login = async (req,res) => {
    try {
        
        const {email, password} = req.body;
        const admin = await User.findOne({email:email,isAdmin:true});
        if(admin){
            const passwordMatch = await bcrypt.compare(password,admin.password);
            if(passwordMatch){
                req.session.admin = admin._id;   // after successful login
                return res.redirect("/admin/dashboard");
            }else{
                return res.render("admin-login", { message: "Password mismatch" });
            }
        }else{
            return res.render("admin-login", { message: "invalid email" });
        }

    } catch (error) {

        console.log("Login Error",err);
        return res,redirect("/pageerror");
        
    }
}

//////////////////////////////////////////////////////////////////////////////////////

const loadDashboard = async (req,res) => {
        try {
            res.render("dashboard");

        } catch (error) {
            res.redirect("/pageerror")
        }  
}

///////////////////////////////////////////////////////////////////////////////////////

const pageerror = async (req,res) => {
    res.render("admin-error");
} 

/////////////////////////////////////////////////////////////////////////////////////////

const logout = async (req,res) => {
    try {
        
        req.session.destroy(err => {
            if(err){
                console.log("Error destroying session",err);
                return res.redirect("/pageerror");
            }else{
                return res.redirect('/admin/login')
            }
        }) 

    } catch (error) {

        console.log("Unexpected error during logout",error);
        return res.redirect("/pageerror");
        
    }
}

////////////////////////////////////////////////////////////////////////////////////////


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
}