const User = require('../../models/userSchema');


////////////////////////////////////////////////////////

const customerInfo = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const query = {
            isAdmin: { $in: [null, false] },
            $or: [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ]
        };

        const userData = await User.find(query)
            .sort({ _id: -1 }) // descending order, latest first
            .skip((page - 1) * limit)
            .limit(limit);

        const count = await User.countDocuments(query);

        res.render('customers', {
            data: userData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            search
        });
    } catch (error) {
        console.log("error", error);
        res.status(500).send("Internal Server Error");
    }
};

//////////////////////////////////////////////////////////////////////////

const customerBlocked = async (req,res) => {
    console.log("blocking");
    try {
        
        let id = req.query.id;
        console.log(id);
        await User.updateOne({_id:id},{$set:{isBlocked:true}});
        res.redirect('/admin/users');

    } catch (error) {
        console.log(error)
        res.redirect('/admin/pageerror');
    }
}


//////////////////////////////////////////////////////////////////////////


const customerUnblocked = async (req,res) => {
    try {
        
        let id = req.query.id;
        await User.updateOne({_id:id},{$set:{isBlocked:false}});
        res.redirect('/admin/users');

    } catch (error) {
        res.redirect('/admin/pageerror');
    }
}


///////////////////////////////////////////////////////////////////////////////


module.exports = {
    customerInfo,
    customerBlocked,
    customerUnblocked
}