const mongoose = require("mongoose");
const { Schema } = mongoose;


const singleAddressSchema = new Schema({
    addressType: { type: String, required: true },
    name: { type: String, required: true },
    city: { type: String, required: true },
    landmark: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: Number, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String },
    isDefault: { type: Boolean, default: false }
});


const addressSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    addresses: [singleAddressSchema] // ARRAY of addresses
});

const Address = mongoose.model("Address", addressSchema);
module.exports = Address;