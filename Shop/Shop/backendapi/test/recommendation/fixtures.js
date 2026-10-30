// Dữ liệu nhỏ, viết tay, để kiểm thử gợi ý mà không cần MongoDB.

const id = (n) => n.toString(16).padStart(24, "0");

const CAT_PHONE = id(0xc1);
const CAT_ACC = id(0xc2);

const P = {
    phone: id(1), // điện thoại đang xem
    caseA: id(2), // ốp: mua kèm rất thường xuyên
    glass: id(3), // kính: mua kèm khá thường xuyên
    charger: id(4), // sạc: mua kèm thỉnh thoảng
    soldOut: id(5), // mua kèm thường xuyên nhưng HẾT HÀNG
    popular: id(6), // phụ kiện bán rất chạy, không liên quan tới phone (lift <= 1)
    phone2: id(7), // điện thoại cùng danh mục, không có luật
    lonely: id(8), // sản phẩm không có trong đơn nào
    phone3: id(9), // điện thoại cùng danh mục, bán chạy hơn phone2
};

const products = [
    { _id: P.phone, name: "Phone X", image: "x.svg", price: "10000000", category_id: CAT_PHONE, is_stock: true },
    { _id: P.caseA, name: "Ốp X", image: "case.svg", price: "200000", category_id: CAT_ACC, is_stock: true },
    { _id: P.glass, name: "Kính X", image: "glass.svg", price: "150000", category_id: CAT_ACC, is_stock: true },
    { _id: P.charger, name: "Sạc 20W", image: "charger.svg", price: "390000", category_id: CAT_ACC, is_stock: true },
    { _id: P.soldOut, name: "Tai nghe hết hàng", image: "ear.svg", price: "500000", category_id: CAT_ACC, is_stock: false },
    { _id: P.popular, name: "Cáp phổ biến", image: "cable.svg", price: "100000", category_id: CAT_ACC, is_stock: true },
    { _id: P.phone2, name: "Phone Y", image: "y.svg", price: "8000000", category_id: CAT_PHONE, is_stock: true },
    { _id: P.lonely, name: "Sản phẩm mới", image: "new.svg", price: "50000", category_id: CAT_ACC, is_stock: true },
    { _id: P.phone3, name: "Phone Z", image: "z.svg", price: "9000000", category_id: CAT_PHONE, is_stock: true },
];

/** 40 đơn có cấu trúc biết trước. */
function makeOrders() {
    const baskets = [];
    const add = (times, items) => {
        for (let i = 0; i < times; i++) baskets.push(items);
    };
    add(8, [P.phone, P.caseA, P.glass, P.soldOut]); // phone + ốp + kính + tai nghe
    add(2, [P.phone, P.caseA, P.charger]);
    add(2, [P.phone, P.caseA]);
    add(2, [P.phone]);
    add(16, [P.popular]); // cáp bán rất chạy nhưng hầu như không đi cùng phone
    add(1, [P.phone, P.popular]);
    add(3, [P.phone3]);
    add(1, [P.phone2]);
    add(5, [P.charger, P.popular]);
    return baskets.map((items) => ({ items: items.map((prd_id) => ({ prd_id, qty: 1, price: 1 })) }));
}

module.exports = { id, P, CAT_PHONE, CAT_ACC, products, makeOrders };
