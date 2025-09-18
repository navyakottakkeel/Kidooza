const Category = require('../../models/categorySchema');


const categoryInfo = async (req,res) =>{
    try {
        
        let search = req.query.search || "";
        let page = parseInt(req.query.page) || 1; 
        const limit = 6;

        const query = {
            isDeleted : false,
            name : {$regex : search, $options: "i"}
        };

        const categories = await Category.find(query)
        .sort({createdAt : -1})
        .skip((page - 1) * limit)
        .limit(limit);

        const count = await Category.countDocuments(query);

        res.render("categories",{
            data : categories,
            search,
            currentPage : page,
            totalPages : Math.ceil(count / limit),
            msg: req.query.msg || null
        });


    } catch (error) {
        console.log("Error occured ",error)
    }

}

////////////////////////////////////////////////////////////////////////////////

const addCategory = async (req, res) => {
    try {
        const name = req.body.name.trim();
        const description = req.body.description.trim();

        if (!name) {
            return res.redirect('/admin/category?msg=Name cannot be empty');
        }

        if (!description) {
            return res.redirect('/admin/category?msg=Description cannot be empty');
        }

        const exists = await Category.findOne({ 
            name: { $regex: new RegExp("^" + name + "$", "i") }, 
            isDeleted: false 
        });
        if (exists) {
            return res.redirect('/admin/category?msg=Category already exists');
        }

        const newCat = new Category({ name,description });
        await newCat.save();
        res.redirect('/admin/category?msg=Category added successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/category');
    }
};

/////////////////////////////////////////////////////////////////////////////////

const editCategory = async (req, res) => {
    try {
        const { id, name, description } = req.body;

        if (!name.trim()) {
            return res.status(400).json({ success: false, message: "Name cannot be empty" });
        }

        if (!description.trim()) {
            return res.status(400).json({ success: false, message: "Description cannot be empty" });
        }

        const exists = await Category.findOne({ name, isDeleted: false, _id: { $ne: id } });
        if (exists) {
            return res.status(400).json({ success: false, message: "Category name already exists" });
        }

        await Category.findByIdAndUpdate(id, { name: name.trim(), description: description.trim() });

        return res.json({ success: true });
    } catch (err) {
        console.error("Edit Category Error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};



////////////////////////////////////////////////////////////////////////////////

const softDeleteCategory = async (req, res) => {
    try {
      const id = req.query.id;
      console.log("Deleting category with ID:", id);

      if (!id) throw new Error("ID not found");
  
      await Category.findByIdAndUpdate(id, { isDeleted: true });
  
      res.redirect('/admin/category?msg=Category deleted successfully');
    } catch (err) {
      console.log("Soft Delete Error:", err.message);
      res.redirect('/admin/category?msg=Something went wrong');
    }
  };
  
  

/////////////////////////////////////////////////////////////////////////////////



module.exports = {
    categoryInfo,
    addCategory,
    editCategory,
    softDeleteCategory
}