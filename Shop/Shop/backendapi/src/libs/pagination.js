const pagination = async (model,query, limit, page) => {
    const totalRows = await model.find(query).countDocuments();
    const totalPages = Math.ceil(totalRows / limit);
    const next = page + 1;
    const prev = page - 1;
    const hasNext = page + 1 <= totalPages ? true : false;
    const hasPrev = page - 1 > 0 ? true : false;
    return {
        totalRows,
        totalPages,
        currentPage: page,
        next,
        prev,
        hasNext,
        hasPrev,
    }
}
module.exports = pagination;