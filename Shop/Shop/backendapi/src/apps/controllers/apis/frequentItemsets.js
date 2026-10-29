// const OrderModel = require('../../models/order');
// const ProductModel = require('../../models/product');

// exports.getProductSuggestions = async (req, res) => {
//     const { id } = req.params; // id của sản phẩm được chọn
//     const minSup = 0.01; // Ngưỡng độ hỗ trợ
//     const minConf = 0.01; // Ngưỡng độ tin cậy

//     try {
//         // Lấy tất cả các đơn hàng từ cơ sở dữ liệu
//         const orders = await OrderModel.find();

//         // Tính toán độ hỗ trợ cho các cặp sản phẩm
//         const productPairs = {};
//         const productCount = {};
//         const totalOrders = orders.length;

//         orders.forEach(order => {
//             const items = order.items;
//             const itemIds = items.map(item => item.prd_id);

//             // Đếm tần suất xuất hiện của từng sản phẩm
//             itemIds.forEach(productId => {
//                 if (!productCount[productId]) {
//                     productCount[productId] = 0;
//                 }
//                 productCount[productId] += 1;
//             });

//             // Đếm tần suất xuất hiện của từng cặp sản phẩm
//             for (let i = 0; i < itemIds.length; i++) {
//                 for (let j = i + 1; j < itemIds.length; j++) {
//                     const pair = [itemIds[i], itemIds[j]].sort().join('-');
//                     if (!productPairs[pair]) {
//                         productPairs[pair] = 0;
//                     }
//                     productPairs[pair] += 1;
//                 }
//             }
//         });

//         // Lọc các cặp sản phẩm thỏa mãn ngưỡng độ hỗ trợ
//         const frequentPairs = {};
//         for (const pair in productPairs) {
//             const support = productPairs[pair] / totalOrders;
//             if (support >= minSup) {
//                 frequentPairs[pair] = support;
//             }
//         }

//         // Tính toán độ tin cậy và lọc các cặp sản phẩm thỏa mãn ngưỡng độ tin cậy
//         const productFrequency = {};
//         for (const pair in frequentPairs) {
//             const [productId1, productId2] = pair.split('-');
//             const confidence1 = productPairs[pair] / productCount[productId1];
//             const confidence2 = productPairs[pair] / productCount[productId2];

//             if (productId1 === id && confidence1 >= minConf) {
//                 if (!productFrequency[productId2]) {
//                     productFrequency[productId2] = 0;
//                 }
//                 productFrequency[productId2] += productPairs[pair];
//             }

//             if (productId2 === id && confidence2 >= minConf) {
//                 if (!productFrequency[productId1]) {
//                     productFrequency[productId1] = 0;
//                 }
//                 productFrequency[productId1] += productPairs[pair];
//             }
//         }

//         // Sắp xếp các sản phẩm gợi ý theo tần suất kết hợp giảm dần
//         const sortedSuggestedProducts = Object.keys(productFrequency).sort((a, b) => productFrequency[b] - productFrequency[a]);

//         // Giới hạn số lượng sản phẩm gợi ý là 5
//         const limitedSuggestedProducts = sortedSuggestedProducts.slice(0, 5);

//         // Lấy thông tin chi tiết của các sản phẩm gợi ý từ cơ sở dữ liệu
//         const suggestedProductDetails = await ProductModel.find({ _id: { $in: limitedSuggestedProducts } });

//         // Chuẩn bị kết quả trả về
//         const responseData = suggestedProductDetails.map(product => ({
//             _id: product._id,
//             name: product.name,
//             image: product.image,
//             price: product.price,
//         })).sort((a, b) => limitedSuggestedProducts.indexOf(a._id.toString()) - limitedSuggestedProducts.indexOf(b._id.toString()));

//         res.status(200).json({
//             status: "success",
//             data: responseData,
//         });
//     } catch (error) {
//         console.error("Error fetching product suggestions:", error);
//         res.status(500).json({
//             status: "error",
//             message: "Internal Server Error",
//         });
//     }
// };







//const OrderModel = require('../../models/order');
// const ProductModel = require('../../models/product');

// // Hàm để tạo cây FP
// const buildFPTree = (transactions, minSup) => {
//     const itemFrequency = {};
//     transactions.forEach(transaction => {
//         transaction.forEach(item => {
//             if (!itemFrequency[item]) {
//                 itemFrequency[item] = 0;
//             }
//             itemFrequency[item] += 1;
//         });
//     });

//     const frequentItems = Object.keys(itemFrequency).filter(item => itemFrequency[item] >= minSup);

//     const fpTree = {};
//     transactions.forEach(transaction => {
//         const sortedTransaction = transaction.filter(item => frequentItems.includes(item)).sort((a, b) => itemFrequency[b] - itemFrequency[a]);
//         let currentNode = fpTree;
//         sortedTransaction.forEach(item => {
//             if (!currentNode[item]) {
//                 currentNode[item] = { count: 0, children: {} };
//             }
//             currentNode[item].count += 1;
//             currentNode = currentNode[item].children;
//         });
//     });

//     return fpTree;
// };

// // Hàm để tìm các tập hợp mục phổ biến từ cây FP
// const mineFPTree = (fpTree, prefix = [], minSup, frequentItemSets = []) => {
//     for (const item in fpTree) {
//         const newPrefix = prefix.concat(item);
//         const count = fpTree[item].count;

//         if (count >= minSup) {
//             frequentItemSets.push({ items: newPrefix, count: count });

//             const newFPTree = {};
//             let newTransactions = [];

//             for (const child in fpTree[item].children) {
//                 const childTransactions = [];
//                 const childNode = fpTree[item].children[child];

//                 for (let i = 0; i < childNode.count; i++) {
//                     childTransactions.push(newPrefix.concat(child));
//                 }

//                 newTransactions = newTransactions.concat(childTransactions);
//             }

//             const subtree = buildFPTree(newTransactions, minSup);
//             mineFPTree(subtree, newPrefix, minSup, frequentItemSets);
//         }
//     }

//     return frequentItemSets;
// };

// // Hàm để tính toán độ hỗ trợ
// const calculateSupport = (transactions, itemSet) => {
//     let count = 0;
//     transactions.forEach(transaction => {
//         if (itemSet.every(item => transaction.includes(item))) {
//             count += 1;
//         }
//     });
//     return count / transactions.length;
// };

// // Hàm để tính toán độ tin cậy
// const calculateConfidence = (transactions, itemSet, minConf) => {
//     const support = calculateSupport(transactions, itemSet);
//     const subsetSupport = calculateSupport(transactions, itemSet.slice(0, -1));
//     return support / subsetSupport >= minConf;
// };

// // Hàm để tìm các tập hợp mục phổ biến bằng thuật toán Apriori
// const apriori = (transactions, minSup, minConf) => {
//     const frequentItemSets = [];
//     const itemFrequency = {};

//     transactions.forEach(transaction => {
//         transaction.forEach(item => {
//             if (!itemFrequency[item]) {
//                 itemFrequency[item] = 0;
//             }
//             itemFrequency[item] += 1;
//         });
//     });

//     const frequentItems = Object.keys(itemFrequency).filter(item => itemFrequency[item] >= minSup);

//     const candidatePairs = {};
//     for (let i = 0; i < frequentItems.length; i++) {
//         for (let j = i + 1; j < frequentItems.length; j++) {
//             const pair = [frequentItems[i], frequentItems[j]].sort().join('-');
//             candidatePairs[pair] = calculateSupport(transactions, pair.split('-'));
//         }
//     }

//     for (const pair in candidatePairs) {
//         if (candidatePairs[pair] >= minConf) {
//             frequentItemSets.push({ items: pair.split('-'), support: candidatePairs[pair] });
//         }
//     }

//     return frequentItemSets;
// };

// exports.getProductSuggestions = async (req, res) => {
//     const { id } = req.params;
//     const minSup = 1;
//     const minConf = 0.01;

//     try {
//         const orders = await OrderModel.find();

//         const transactions = orders.map(order => order.items.map(item => item.prd_id));

//         // Sử dụng FP-growth để tìm các tập hợp mục phổ biến
//         const fpTree = buildFPTree(transactions, minSup * orders.length);
//         const frequentItemSetsFP = mineFPTree(fpTree, [], minSup * orders.length);

//         // Sử dụng Apriori để lọc các tập hợp mục thỏa mãn ngưỡng độ tin cậy
//         const frequentItemSetsApriori = apriori(transactions, minSup * orders.length, minConf);

//         // Kết hợp các tập hợp mục phổ biến từ FP-growth và Apriori
//         const combinedFrequentItemSets = [...frequentItemSetsFP, ...frequentItemSetsApriori];

//         // Tính toán độ tin cậy và lọc các tập hợp mục thỏa mãn ngưỡng độ tin cậy
//         const productFrequency = {};
//         combinedFrequentItemSets.forEach(itemSet => {
//             if (itemSet.items.includes(id)) {
//                 itemSet.items.forEach(productId => {
//                     if (productId !== id && calculateConfidence(transactions, itemSet.items, minConf)) {
//                         if (!productFrequency[productId]) {
//                             productFrequency[productId] = 0;
//                         }
//                         productFrequency[productId] += itemSet.count || itemSet.support;
//                     }
//                 });
//             }
//         });

//         // Sắp xếp các sản phẩm gợi ý theo tần suất kết hợp giảm dần
//         const sortedSuggestedProducts = Object.keys(productFrequency).sort((a, b) => productFrequency[b] - productFrequency[a]);

//         // Giới hạn số lượng sản phẩm gợi ý là 5
//         const limitedSuggestedProducts = sortedSuggestedProducts.slice(0, 5);

//         // Lấy thông tin chi tiết của các sản phẩm gợi ý từ cơ sở dữ liệu
//         const suggestedProductDetails = await ProductModel.find({ _id: { $in: limitedSuggestedProducts } });

//         // Chuẩn bị kết quả trả về
//         const responseData = suggestedProductDetails.map(product => ({
//             _id: product._id,
//             name: product.name,
//             image: product.image,
//             price: product.price,
//         })).sort((a, b) => limitedSuggestedProducts.indexOf(a._id.toString()) - limitedSuggestedProducts.indexOf(b._id.toString()));

//         res.status(200).json({
//             status: "success",
//             data: responseData,
//         });
//     } catch (error) {
//         console.error("Error fetching product suggestions:", error);
//         res.status(500).json({
//             status: "error",
//             message: "Internal Server Error",
//         });
//     }
// };



// const OrderModel = require('../../models/order');
// const ProductModel = require('../../models/product');

// exports.getProductSuggestions = async (req, res) => {
//     const { id } = req.params; // id của sản phẩm được chọn
//     const minSup = 0.01; // Ngưỡng độ hỗ trợ
//     const minConf = 0.01; // Ngưỡng độ tin cậy

//     try {
//         // Lấy tất cả các đơn hàng từ cơ sở dữ liệu
//         const orders = await OrderModel.find();

//         // Tính toán độ hỗ trợ cho các cặp sản phẩm
//         const productPairs = {};
//         const productCount = {};
//         const totalOrders = orders.length;

//         orders.forEach(order => {
//             const items = order.items;
//             const itemIds = items.map(item => item.prd_id);

//             // Đếm tần suất xuất hiện của từng sản phẩm
//             itemIds.forEach(productId => {
//                 if (!productCount[productId]) {
//                     productCount[productId] = 0;
//                 }
//                 productCount[productId] += 1;
//             });

//             // Đếm tần suất xuất hiện của từng cặp sản phẩm
//             for (let i = 0; i < itemIds.length; i++) {
//                 for (let j = i + 1; j < itemIds.length; j++) {
//                     const pair = [itemIds[i], itemIds[j]].sort().join('-');
//                     if (!productPairs[pair]) {
//                         productPairs[pair] = 0;
//                     }
//                     productPairs[pair] += 1;
//                 }
//             }
//         });

//         // Đếm số lần xuất hiện của sản phẩm được chọn
//         const targetProductCount = productCount[id] || 0;

//         // Lọc các cặp sản phẩm thỏa mãn ngưỡng độ hỗ trợ
//         const frequentPairs = {};
//         for (const pair in productPairs) {
//             const support = productPairs[pair] / totalOrders;
//             if (support >= minSup) {
//                 frequentPairs[pair] = support;
//             }
//         }

//         // Tính toán độ tin cậy và lọc các cặp sản phẩm thỏa mãn ngưỡng độ tin cậy
//         const productFrequency = {};
//         for (const pair in frequentPairs) {
//             const [productId1, productId2] = pair.split('-');
//             const confidence1 = productPairs[pair] / productCount[productId1];
//             const confidence2 = productPairs[pair] / productCount[productId2];

//             if (productId1 === id && confidence1 >= minConf) {
//                 if (!productFrequency[productId2]) {
//                     productFrequency[productId2] = {
//                         count: productPairs[pair],
//                         confidence: confidence1
//                     };
//                 }
//             }

//             if (productId2 === id && confidence2 >= minConf) {
//                 if (!productFrequency[productId1]) {
//                     productFrequency[productId1] = {
//                         count: productPairs[pair],
//                         confidence: confidence2
//                     };
//                 }
//             }
//         }

//         // Sắp xếp các sản phẩm gợi ý theo tần suất kết hợp giảm dần
//         const sortedSuggestedProducts = Object.keys(productFrequency).sort((a, b) => productFrequency[b].count - productFrequency[a].count);

//         // Giới hạn số lượng sản phẩm gợi ý là 5
//         const limitedSuggestedProducts = sortedSuggestedProducts.slice(0, 5);

//         // Lấy thông tin chi tiết của các sản phẩm gợi ý từ cơ sở dữ liệu
//         const suggestedProductDetails = await ProductModel.find({ _id: { $in: limitedSuggestedProducts } });

//         // Chuẩn bị kết quả trả về
//         const responseData = suggestedProductDetails.map(product => ({
//             _id: product._id,
//             name: product.name,
//             image: product.image,
//             price: product.price,
//             confidence: productFrequency[product._id.toString()] ? productFrequency[product._id.toString()].confidence : 0,
//         })).sort((a, b) => limitedSuggestedProducts.indexOf(a._id.toString()) - limitedSuggestedProducts.indexOf(b._id.toString()));

//         res.status(200).json({
//             status: "success",
//             data: responseData,
//             targetProductCount: targetProductCount // Trả về số lần xuất hiện của sản phẩm được chọn
//         });
//     } catch (error) {
//         console.error("Error fetching product suggestions:", error);
//         res.status(500).json({
//             status: "error",
//             message: "Internal Server Error",
//         });
//     }
// };