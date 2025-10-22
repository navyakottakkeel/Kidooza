const User = require("../../models/userSchema");
const HTTP_STATUS = require("../../constants/httpStatus");
const bcrypt = require("bcrypt");

////////////////////////////////////////////////////////////////

const loadLogin = async (req, res, next) => {
    try {
      if (req.session.admin) {
        return res.redirect("/admin/dashboard"); 
      } else {
        return res.status(HTTP_STATUS.OK).render("admin-login", { message: null });
      }
    } catch (error) {
      next(error);
    }
  };  

/////////////////////////////////////////////////////////////////

const login = async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const admin = await User.findOne({ email: email, isAdmin: true });
  
      if (!admin) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .render("admin-login", { message: "Invalid email" });
      }
  
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res
          .status(HTTP_STATUS.UNAUTHORIZED)
          .render("admin-login", { message: "Password mismatch" });
      }
  
      req.session.admin = admin._id; // after successful login
      return res.redirect("/admin/dashboard");
    } catch (error) {
      next(error);
    }
  }

//////////////////////////////////////////////////////////////////////////////////////

const pageerror = async (req, res, next) => {
    try {
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .render("admin-error");
    } catch (error) {
      next(error);
    }
  }; 

/////////////////////////////////////////////////////////////////////////////////////////

const logout = async (req, res, next) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error("Error destroying session", err);
          return res
            .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .redirect("/pageerror");
        } else {
          return res.redirect("/admin/login");
        }
      });
    } catch (error) {
      next(error);
    }
  };
  
////////////////////////////////////////////////////////////////////////////////////////

module.exports = {
    loadLogin,
    login,
    pageerror,
    logout
}