const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const mongoose = require("mongoose");


const loadAddressPage = async (req, res) => {
    try {

        let user = null;

        if (req.user) {
            user = req.user;
        } else if (req.session.user) {
            user = await User.findById(req.session.user);
        }

        const userId = req.user ? req.user._id : req.session.user;
        const doc = await Address.findOne({ userId }).lean(); // doc.addresses is the array
        const addresses = doc ? (doc.addresses || []) : [];

        res.locals.user = user;

        res.render("address", { addresses, user: req.user || null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};


////////////////////////////////////////////////////////////////////////////////////////////////

const saveAddress = async (req, res) => {
    try {
        const userId = req.user ? req.user._id : req.session.user;

        let userAddressDoc = await Address.findOne({ userId });

        const isFirstAddress = !userAddressDoc || userAddressDoc.addresses.length === 0;

        const newAddress = {
            addressType: req.body.addressType,
            name: req.body.name,
            city: req.body.city,
            landmark: req.body.landmark,
            state: req.body.state,
            pincode: req.body.pincode,
            phone: req.body.phone,
            altPhone: req.body.altPhone || null,
            isDefault: isFirstAddress ? true : (req.body.isDefault || false) // 👈 First one default
        };

        if (!userAddressDoc) {
            // First address for this user
            userAddressDoc = new Address({
                userId,
                addresses: [newAddress]
            });
        } else {
            // Add to existing addresses
            userAddressDoc.addresses.push(newAddress);
        }

        await userAddressDoc.save();

        return res.json({ success: true, message: "Address saved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Error saving address" });
    }
};


/////////////////////////////////////////////////////////////////////////////////////////////////

const setDefaultAddress = async (req, res) => {

    try {
        const addressId = new mongoose.Types.ObjectId(req.params.id);
        const userId = req.user ? req.user._id : req.session.user;


        // 1️⃣ Set all addresses for the user to not default
        await Address.updateOne(
            { userId: userId },
            { $set: { "addresses.$[].isDefault": false } }
        );

        // 2️⃣ Set the specific address to default
        const result = await Address.updateOne(
            {
                userId: userId,
                "addresses._id": addressId
            },
            {
                $set: {
                    "addresses.$.isDefault": true
                }
            }
        );


        if (result.modifiedCount === 0) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        res.status(200).json({ success: true, message: "Default address updated" });
    } catch (err) {
        console.error("Error setting default address:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};



///////////////////////////////////////////////////////////////////////////////////////////////


// GET /address/:id (fetch one address for editing)
const getAddressById = async (req, res) => {
    try {
        const addressId = new mongoose.Types.ObjectId(req.params.id);
        const userId = req.user ? req.user._id : req.session.user;

        const userAddressDoc = await Address.findOne(
            { userId, "addresses._id": addressId },
            { "addresses.$": 1 } // only return matching address
        );

        if (!userAddressDoc || !userAddressDoc.addresses.length) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        res.json({ success: true, address: userAddressDoc.addresses[0] });
    } catch (err) {
        console.error("Error fetching address:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


////////////////////////////////////////////////////////////////////////////////////////////////////

// PATCH /address/:id
const updateAddress = async (req, res) => {
    try {
        const addressId = new mongoose.Types.ObjectId(req.params.id);
        const userId = req.user ? req.user._id : req.session.user;

        const updated = await Address.updateOne(
            { 
                userId: userId,
                "addresses._id": addressId
             },
            {
                $set: {
                    "addresses.$.addressType": req.body.addressType,
                    "addresses.$.name": req.body.name,
                    "addresses.$.city": req.body.city,
                    "addresses.$.landmark": req.body.landmark,
                    "addresses.$.state": req.body.state,
                    "addresses.$.pincode": req.body.pincode,
                    "addresses.$.phone": req.body.phone,
                    "addresses.$.altPhone": req.body.altPhone || null
                }
            }
        );

        console.log("UPDATEDC:",updated);

        if(updated.modifiedCount === 0){
            res.status(400).send("Update failed");
        } else {
            res.status(200).json({ success: true, message: 'Address updated successfully' });
        }

       
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

/////////////////////////////////////////////////////////////////////////////////////////////////

// DELETE /address/:id
const deleteAddress = async (req, res) => {
    try {
        const addressId = new mongoose.Types.ObjectId(req.params.id);
        const userId = req.user ? req.user._id : req.session.user;

        const result = await Address.updateOne(
            { userId },
            { $pull: { addresses: { _id: addressId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        res.json({ success: true, message: "Address deleted successfully" });
    } catch (err) {
        console.error("Error deleting address:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



////////////////////////////////////////////////////////////////////////////////////////////////


module.exports = {
    loadAddressPage,
    saveAddress,
    setDefaultAddress,
    getAddressById,
    updateAddress,
    deleteAddress
}