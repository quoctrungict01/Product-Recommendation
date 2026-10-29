const mongoose = require('mongoose');
const config = require("config");
module.exports = ()=>{
    mongoose
        .connect(config.get("db.mongodb.uri")) 
        .then(()=>console.log("Connected!"));
    return mongoose;
}
