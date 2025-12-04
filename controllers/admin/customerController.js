const User = require('../../models/userSchema');
const HTTP_STATUS = require("../../constants/httpStatus");


////////////////////////////////////////////////////////

const customerInfo = async (req, res, next) => {
    try {
      const search = req.query.search || "";
      const page = parseInt(req.query.page) || 1;
      const limit = 6;
  
      const query = {
        isAdmin: { $in: [null, false] },
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
  
      const userData = await User.find(query)
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
  
      const count = await User.countDocuments(query);
      const totalPages = Math.ceil(count / limit);
      
      const responseData = {
        data: userData,
        currentPage: page,
        totalPages,
        search,
      }
  
      return res.status(HTTP_STATUS.OK).render("customers", responseData);
    } catch (error) {
      next(error)
    }
  };

//////////////////////////////////////////////////////////////////////////


const customerBlocked = async (req, res, next) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "User ID is required" });
    }

    const user = await User.findByIdAndUpdate(id, { isBlocked: true });

    if (!user) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json({ success: false, message: "User not found" });
    }

    return res
      .status(HTTP_STATUS.OK)
      .redirect("/admin/users?msg=User blocked successfully");
  } catch (error) {
    next(error)
  }
};

//////////////////////////////////////////////////////////////////////////

const customerUnblocked = async (req, res, next) => {
    try {
      const { id } = req.query;
  
      if (!id) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ success: false, message: "User ID is required" });
      }
  
      const user = await User.findByIdAndUpdate(id, { isBlocked: false });
  
      if (!user) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json({ success: false, message: "User not found" });
      }
  
      return res
        .status(HTTP_STATUS.OK)
        .redirect("/admin/users?msg=User unblocked successfully");
    } catch (error) {
      next(error)
    }
  };

///////////////////////////////////////////////////////////////////////////////


module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked
}