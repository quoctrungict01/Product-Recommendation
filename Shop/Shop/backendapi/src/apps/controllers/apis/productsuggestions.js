
//Prdiori
const OrderModel = require('../../models/order');
const ProductModel = require('../../models/product');

exports.getProductSuggestions = async (req, res) => {
    const { id } = req.params; // id của sản phẩm được chọn
    const minSup = 5; // Ngưỡng độ hỗ trợ
    const minConf = 0.01; // Ngưỡng độ tin cậy

    try {
        // Lấy tất cả các đơn hàng từ cơ sở dữ liệu
        const orders = await OrderModel.find();

        // Tính toán độ hỗ trợ cho các cặp sản phẩm
        const productPairs = {};
        const productCount = {};
        const totalOrders = orders.length;

        orders.forEach(order => {
            const items = order.items;
            const itemIds = items.map(item => item.prd_id);

            // Đếm tần suất xuất hiện của từng sản phẩm
            itemIds.forEach(productId => {
                if (!productCount[productId]) {
                    productCount[productId] = 0;
                }
                productCount[productId] += 1;
            });

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

        // Lọc các cặp sản phẩm thỏa mãn ngưỡng độ hỗ trợ
        const frequentPairs = {};
        for (const pair in productPairs) {
            const support = productPairs[pair] / totalOrders;
            if (support >= minSup) {
                frequentPairs[pair] = support;
            }
        }

        // Tính toán độ tin cậy và lọc các cặp sản phẩm thỏa mãn ngưỡng độ tin cậy
        const productFrequency = {};
        for (const pair in frequentPairs) {
            const [productId1, productId2] = pair.split('-');
            const confidence1 = productPairs[pair] / productCount[productId1];
            const confidence2 = productPairs[pair] / productCount[productId2];

            if (productId1 === id && confidence1 >= minConf) {
                if (!productFrequency[productId2]) {
                    productFrequency[productId2] = 0;
                }
                productFrequency[productId2] += productPairs[pair];
            }

            if (productId2 === id && confidence2 >= minConf) {
                if (!productFrequency[productId1]) {
                    productFrequency[productId1] = 0;
                }
                productFrequency[productId1] += productPairs[pair];
            }
        }

        // Sắp xếp các sản phẩm gợi ý theo tần suất kết hợp giảm dần
        const sortedSuggestedProducts = Object.keys(productFrequency).sort((a, b) => productFrequency[b] - productFrequency[a]);

        // Giới hạn số lượng sản phẩm gợi ý là 5
        const limitedSuggestedProducts = sortedSuggestedProducts.slice(0, 5);

        // Lấy thông tin chi tiết của các sản phẩm gợi ý từ cơ sở dữ liệu
        const suggestedProductDetails = await ProductModel.find({ _id: { $in: limitedSuggestedProducts } });

        // Chuẩn bị kết quả trả về
        const responseData = suggestedProductDetails.map(product => ({
            _id: product._id,
            name: product.name,
            image: product.image,
            price: product.price,
        })).sort((a, b) => limitedSuggestedProducts.indexOf(a._id.toString()) - limitedSuggestedProducts.indexOf(b._id.toString()));

        res.status(200).json({
            status: "success",
            data: responseData,
        });
    } catch (error) {
        console.error("Error fetching product suggestions:", error);
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};




// const OrderModel = require('../../models/order');
// const ProductModel = require('../../models/product');

// // Hàm để xây dựng cây FP (FP-tree) từ các giao dịch
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

// // Hàm để duyệt cây FP để đào tạo các tập hợp phổ biến (Frequent Item Sets)
// const mineFPTree = (fpTree, minSup) => {
//     const frequentItemSets = [];

//     const traverseTree = (node, prefix = []) => {
//         const items = Object.keys(node).sort((a, b) => node[b].count - node[a].count);
//         items.forEach(item => {
//             const newPrefix = prefix.concat(item);
//             frequentItemSets.push({ items: newPrefix, count: node[item].count });
//             traverseTree(node[item].children, newPrefix);
//         });
//     };

//     traverseTree(fpTree);
    
//     return frequentItemSets.filter(itemSet => itemSet.items.length > 1 && itemSet.count >= minSup);
// };

// // Hàm để tính toán độ tin cậy của các cặp sản phẩm
// const calculateConfidence = (transactions, itemSet, minConf) => {
//     const [itemA, itemB] = itemSet;
    
//     const supportAB = transactions.filter(transaction => transaction.includes(itemA) && transaction.includes(itemB)).length;
//     const supportA = transactions.filter(transaction => transaction.includes(itemA)).length;
    
//     const confidence = supportA > 0 ? supportAB / supportA : 0;
    
//     return confidence >= minConf;
// };

// // Hàm chính để gợi ý sản phẩm
// exports.getProductSuggestions = async (req, res) => {
//     const { id } = req.params; 
//     const minSup = 2; // Ngưỡng độ hỗ trợ tối thiểu
//     const minConf = 0.01; // Ngưỡng độ tin cậy tối thiểu

//     try {
//         const orders = await OrderModel.find();

//         const transactions = orders.map(order => order.items.map(item => item.prd_id.toString()));

//         // Xây dựng cây FP và đào tạo các tập hợp mặt hàng phổ biến
//         const fpTree = buildFPTree(transactions, minSup);
//         const frequentItemSets = mineFPTree(fpTree, minSup);

//         // Lọc và sắp xếp các cặp sản phẩm theo độ tin cậy
//         const confidentPairs = [];
//         frequentItemSets.forEach(itemSet => {
//             if (itemSet.items.includes(id) && itemSet.items.length === 2) {
//                 const confidence = calculateConfidence(transactions, itemSet.items, minConf);
//                 if (confidence) {
//                     confidentPairs.push({
//                         items: itemSet.items,
//                         confidence: confidence
//                     });
//                 }
//             }
//         });

//         // Sắp xếp các cặp sản phẩm theo độ tin cậy giảm dần
//         confidentPairs.sort((a, b) => b.confidence - a.confidence);

//         // Lấy ra 5 cặp sản phẩm có độ tin cậy cao nhất
//         const limitedConfidentPairs = confidentPairs.slice(0, 5);

//         // Lấy danh sách các sản phẩm gợi ý từ các cặp sản phẩm thỏa mãn
//         const suggestedProducts = limitedConfidentPairs.map(item => item.items.find(item => item !== id));

//         // Lấy thông tin chi tiết của các sản phẩm gợi ý từ cơ sở dữ liệu
//         const suggestedProductDetails = await ProductModel.find({ _id: { $in: suggestedProducts } });

//         // Chuẩn bị kết quả trả về
//         const responseData = suggestedProductDetails.map(product => ({
//             _id: product._id,
//             name: product.name,
//             image: product.image,
//             price: product.price,
//         }));

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








