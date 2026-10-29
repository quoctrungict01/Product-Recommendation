// import React, { useState } from 'react';

// const AddCategory = () => {
//     const [categoryName, setCategoryName] = useState('');
//     const [errorMessage, setErrorMessage] = useState('');

//     const handleSubmit = (event) => {
//         event.preventDefault();
//         // Gửi request để thêm danh mục vào hệ thống ở đây
//         if (categoryName.trim() === '') {
//             setErrorMessage('Tên danh mục không được để trống!');
//             return;
//         }
//         // Xử lý logic thêm danh mục ở đây

//         // Sau khi xử lý thành công, có thể reset trạng thái form
//         setCategoryName('');
//         setErrorMessage('');
//     };

//     const handleInputChange = (event) => {
//         setCategoryName(event.target.value);
//         setErrorMessage('');
//     };

//     return (
//         <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
//             <div className="row">
//                 <ol className="breadcrumb">
//                     <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home"></use></svg></a></li>
//                     <li><a href="">Quản lý danh mục</a></li>
//                     <li className="active">Thêm danh mục</li>
//                 </ol>
//             </div>
            
//             <div className="row">
//                 <div className="col-lg-12">
//                     <h1 className="page-header">Thêm danh mục</h1>
//                 </div>
//             </div>
            
//             <div className="row">
//                 <div className="col-lg-12">
//                     <div className="panel panel-default">
//                         <div className="panel-body">
//                             {errorMessage && <div className="alert alert-danger">{errorMessage}</div>}
//                             <form role="form" onSubmit={handleSubmit}>
//                                 <div className="form-group">
//                                     <label>Tên danh mục:</label>
//                                     <input
//                                         required
//                                         type="text"
//                                         name="cat_name"
//                                         className="form-control"
//                                         placeholder="Tên danh mục..."
//                                         value={categoryName}
//                                         onChange={handleInputChange}
//                                     />
//                                 </div>
//                                 <button type="submit" className="btn btn-success">Thêm mới</button>
//                                 <button type="reset" className="btn btn-default">Làm mới</button>
//                             </form>
//                         </div>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// export default AddCategory;


import React, { useState } from 'react';
import { addCategory } from '../../services/Api'; 

const AddCategory = () => {
    const [categoryName, setCategoryName] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (categoryName.trim() === '') {
            setErrorMessage('Tên danh mục không được để trống!');
            return;
        }

        try {
            const response = await addCategory({ cat_name: categoryName }); // Gọi API thêm danh mục
            if (response.status === 201) { // Kiểm tra kết quả thành công từ API (ví dụ: status code 201)
                setSuccessMessage('Thêm danh mục thành công!');
                setCategoryName(''); // Reset trường nhập liệu
                setErrorMessage('');
            } else {
                setErrorMessage('Đã có lỗi xảy ra khi thêm danh mục!');
            }
        } catch (error) {
            console.error('Lỗi khi gọi API:', error);
            setErrorMessage('Đã có lỗi xảy ra khi thêm danh mục!');
        }
    };

    const handleInputChange = (event) => {
        setCategoryName(event.target.value);
        setErrorMessage('');
        setSuccessMessage('');
        console.log(setCategoryName);
    };

    return (
        <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
            <div className="row">
                <ol className="breadcrumb">
                    <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home"></use></svg></a></li>
                    <li><a href="">Quản lý danh mục</a></li>
                    <li className="active">Thêm danh mục</li>
                </ol>
            </div>
            
            <div className="row">
                <div className="col-lg-12">
                    <h1 className="page-header">Thêm danh mục</h1>
                </div>
            </div>
            
            <div className="row">
                <div className="col-lg-12">
                    <div className="panel panel-default">
                        <div className="panel-body">
                            {errorMessage && <div className="alert alert-danger">{errorMessage}</div>}
                            {successMessage && <div className="alert alert-success">{successMessage}</div>}
                            <form role="form" onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Tên danh mục:</label>
                                    <input
                                        required
                                        type="text"
                                        name="cat_name"
                                        className="form-control"
                                        placeholder="Tên danh mục..."
                                        value={categoryName}
                                        onChange={handleInputChange}
                                    />
                                </div>
                                <button type="submit" className="btn btn-success">Thêm mới</button>
                                <button type="reset" className="btn btn-default">Làm mới</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddCategory;

