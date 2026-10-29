// const OrderModel = require("../../models/order");
// const ProductModel = require("../../models/product");
// const transporter = require("../../../libs/mail");
// const_ = require("lodash");
// const ejs = require("ejs");
// const path = require("path");


// exports.order = async (req, res) => {
//   const body = req.body;
//   const totalPrice = body.items.reduce((total, item)=>total+item.price*item.qty, 0);
  
//   const idsPrd = body.items.map((item)=>item.prd_id);
//   const products = await ProductModel.findById({_id: {$in: idsPrd}});
//   let items = [];
//   for(let product of products){
//     const cart = _.find(body.items, {prd_id: product._id.toString()});
//     if(cart){
//       cart.name = product.name;
//       items.push(cart);
//     }
//   }
//   const html = await ejs.renderFile(path.join(req.app.get("views"), "mail.ejs"), {
//     fullName: body.fullName,
//     phone: body.phone,
//     address: body.address,
//     totalPrice,
//     items,
//   });

//   await transporter.sendMail({
//     from: '"Trung Store" <tranquoctrung08@gmail.com>',
//     to: body.email,
//     subject: "Xác nhận đơn hàng",
//     html,
//   })
//   //Create order
//   const order = {
//     fullName: body.fullName,
//     phone: body.phone,
//     email: body.email,
//     address: body.address,
//     totalPrice,
//     items: body.items,
//   };
//   await OrderModel(order).save();
//   res.status(201).json({
//     status: "success",
//     message: "Created order successfully",
//   });
// };




const mongoose = require("../../../common/database")();
const OrderModel = require("../../models/order");
const ProductModel = require("../../models/product");
exports.order = async (req, res) => {
  const body = req.body;
  const totalPrice = body.items.reduce((total, item)=>total+item.price*item.qty, 0);
  //Create order
  const order = {
    fullName: body.fullName,
    phone: body.phone,
    email: body.email,
    address: body.address,
    totalPrice,
    items: body.items,
  };
  await OrderModel(order).save();
  res.status(201).json({
    status: "success",
    message: "Created order successfully",
  });
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await OrderModel.find()
      .populate({
        path: 'items.prd_id',
        model: ProductModel,
        select: 'name'
      })
      .sort({ createdAt: -1 }); // Sort by createdAt field in descending order

    const ordersWithProductNames = orders.map(order => ({
      ...order._doc,
      items: order.items.map(item => ({
        ...item._doc,
        product: item.prd_id ? item.prd_id.name : 'Unknown'
      }))
    }));

    res.status(200).json({
      status: "success",
      data: ordersWithProductNames,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};




// const OrderModel = require("../../models/order");
// const ProductModel = require("../../models/product");

// Danh sách các ID sản phẩm được chỉ định
// const designatedProductPairs = [
//     { id1: "6681958904e1d2459d5701e5", id2: "6683b965dc3358880e743c8c", ratio: 0.7 },
//     { id1: "6681938004e1d2459d5701ac", id2: "6683b5efdc3358880e743beb", ratio: 0.8 }
// ];

// // Danh sách các ID sản phẩm ngẫu nhiên còn lại
// const otherProductIds = [
//     "65af7feeb9edc11b2f837b03", "65af7f81b9edc11b2f837af4", "65af9fd42c3d7651973badd9",
//     "65af9f1e2c3d7651973badb3", "6683bacfdc3358880e743ca3", "66828ceee7904151918a1a82",
//     "6683b906dc3358880e743c87", "6683b7a1dc3358880e743c48", "668196a704e1d2459d5701f7",
//     "668194dd04e1d2459d5701c2"
// ];

// // Hàm để tạo order ngẫu nhiên
// const createRandomOrder = async () => {
//     const fullName = "Customer Name";
//     const email = "customer@example.com";
//     const phone = "0123456789";
//     const address = "Customer Address";
//     const items = [];

//     // Tạo số lượng mặt hàng ngẫu nhiên từ 1 đến 4
//     const itemCount = Math.floor(Math.random() * 4) + 1;

//     // Chọn ngẫu nhiên các cặp mặt hàng theo tỷ lệ
//     const designatedPairs = designatedProductPairs.filter(pair => Math.random() < pair.ratio);
//     let selectedPairs = [];
//     designatedPairs.forEach(pair => {
//         selectedPairs.push({ prd_id: pair.id1, price: 37000000 });
//         selectedPairs.push({ prd_id: pair.id2, price: 1150000 });
//     });

//     // Tạo các mặt hàng còn lại ngẫu nhiên
//     const remainingItems = otherProductIds.slice();
//     while (selectedPairs.length < itemCount * 2) {
//         const randomIndex = Math.floor(Math.random() * remainingItems.length);
//         const productId = remainingItems.splice(randomIndex, 1)[0];
//         const price = Math.floor(Math.random() * 20000000) + 500000; // Giá từ 500,000 đến 20,000,000 đồng
//         selectedPairs.push({ prd_id: productId, price });
//     }

//     // Tạo các mặt hàng trong order
//     for (let i = 0; i < itemCount; i++) {
//         const index = i * 2;
//         const qty = Math.floor(Math.random() * 3) + 1; // Số lượng từ 1 đến 3

//         items.push({
//             prd_id: selectedPairs[index].prd_id,
//             price: selectedPairs[index].price,
//             qty: qty
//         });
//     }

//     const totalPrice = items.reduce((total, item) => total + item.price * item.qty, 0);

//     // Lưu order vào cơ sở dữ liệu
//     const order = new OrderModel({
//         fullName,
//         email,
//         phone,
//         address,
//         items,
//         totalPrice
//     });

//     await order.save();
// };

// // API để tạo 800 order ngẫu nhiên
// exports.createRandomOrders = async (req, res) => {
//     try {
//         for (let i = 0; i < 800; i++) {
//             await createRandomOrder();
//         }
//         res.status(200).json({ status: "success", message: "Successfully created 800 random orders." });
//     } catch (error) {
//         console.error("Error creating random orders:", error);
//         res.status(500).json({ status: "error", message: "Internal Server Error" });
//     }
// };




// API lấy ra tên và số lần xuất hiện của 5 cặp sản phẩm xuất hiện cùng nhau nhiều nhất
exports.getTopProductPairsNames = async (req, res) => {
  try {
      // Lấy tất cả các đơn hàng từ cơ sở dữ liệu
      const orders = await OrderModel.find();

      // Tính toán độ hỗ trợ cho các cặp sản phẩm
      const productPairs = {};
      const totalOrders = orders.length;

      orders.forEach(order => {
          const items = order.items;
          const itemIds = items.map(item => item.prd_id);

          // Đếm tần suất xuất hiện của từng cặp sản phẩm
          for (let i = 0; i < itemIds.length; i++) {
              for (let j = i + 1; j < itemIds.length; j++) {
                  const pair = [itemIds[i], itemIds[j]].sort().join('-');
                  if (!productPairs[pair]) {
                      productPairs[pair] = 0;
                  }
                  productPairs[pair] += 1;
              }
          }
      });

      // Chuyển đổi object thành mảng để có thể sắp xếp
      const sortedPairs = Object.keys(productPairs).sort((a, b) => productPairs[b] - productPairs[a]);

      // Lấy ra tên và số lần xuất hiện của 5 cặp sản phẩm xuất hiện nhiều nhất
      const topPairs = sortedPairs.slice(0, 5);

      // Lấy danh sách các sản phẩm từ các cặp sản phẩm
      const productIds = topPairs.flatMap(pair => pair.split('-'));
      const uniqueProductIds = [...new Set(productIds)]; // Lấy các id sản phẩm duy nhất
      const products = await ProductModel.find({ _id: { $in: uniqueProductIds } });

      // Tạo một map để dễ dàng lấy tên sản phẩm từ id
      const productMap = {};
      products.forEach(product => {
          productMap[product._id.toString()] = product.name;
      });

      // Chuẩn bị kết quả trả về
      const responseData = topPairs.map(pair => {
          const [productId1, productId2] = pair.split('-');
          return {
              pair: [
                  { name: productMap[productId1], count: productPairs[pair] },
                  { name: productMap[productId2], count: productPairs[pair] }
              ]
          };
      });

      res.status(200).json({
          status: "success",
          data: responseData
      });
  } catch (error) {
      console.error("Error fetching top product pairs:", error);
      res.status(500).json({
          status: "error",
          message: "Internal Server Error"
      });
  }
};






