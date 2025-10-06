const Category = require('../../models/categorySchema');
const HTTP_STATUS = require('../../constants/httpStatus');


/////////////////////////////////////////////////////////////////////////////////////////////

const categoryInfo = async (req, res, next) => {
    try {
      let search = req.query.search || "";
      let page = parseInt(req.query.page) || 1; 
      const limit = 6;
  
      const query = {
        isDeleted: false,
        name: { $regex: search, $options: "i" }
      };
  
      const categories = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);
  
      const count = await Category.countDocuments(query);
  
      return res.status(HTTP_STATUS.OK).render("categories", {
        data: categories,
        search,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        msg: req.query.msg || null
      });
  
    } catch (error) {
      next(error);
    }
  };

///////////////////////////////////////////////////////////////////////////////////////////

const addCategory = async (req, res, next) => {
    try {
      const name = req.body.name?.trim();
      const description = req.body.description?.trim();
  
      if (!name) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .redirect('/admin/category?msg=Name cannot be empty');
      }
  
      if (!description) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .redirect('/admin/category?msg=Description cannot be empty');
      }
  
      const exists = await Category.findOne({
        name: { $regex: new RegExp("^" + name + "$", "i") },
        isDeleted: false
      });
  
      if (exists) {
        return res
          .status(HTTP_STATUS.CONFLICT)
          .redirect('/admin/category?msg=Category already exists');
      }
  
      const newCat = new Category({ name, description });
      await newCat.save();
  
      return res
        .status(HTTP_STATUS.CREATED)
        .redirect('/admin/category?msg=Category added successfully');
    } catch (error) {
      next(error);
    }
  };

/////////////////////////////////////////////////////////////////////////////////

const editCategory = async (req, res, next) => {
  try {
    const { id, name, description } = req.body;

    if (!name?.trim()) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Name cannot be empty" });
    }

    if (!description?.trim()) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ success: false, message: "Description cannot be empty" });
    }

    const exists = await Category.findOne({
      name,
      isDeleted: false,
      _id: { $ne: id }
    });

    if (exists) {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json({ success: false, message: "Category name already exists" });
    }

    await Category.findByIdAndUpdate(id, {
      name: name.trim(),
      description: description.trim()
    });

    return res.status(HTTP_STATUS.OK).json({ success: true });
  } catch (error) {
    next(error);
  }
};

////////////////////////////////////////////////////////////////////////////////

const softDeleteCategory = async (req, res, next) => {
    try {
      const id = req.query.id;
  
      if (!id) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .redirect('/admin/category?msg=ID not provided');
      }
  
      await Category.findByIdAndUpdate(id, { isDeleted: true });
  
      return res
        .status(HTTP_STATUS.OK)
        .redirect('/admin/category?msg=Category deleted successfully');
    } catch (error) {
      next(error);
    }
  };
  
/////////////////////////////////////////////////////////////////////////////////


module.exports = {
    categoryInfo,
    addCategory,
    editCategory,
    softDeleteCategory
}