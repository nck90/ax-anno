const items = ["apple", "banana", "orange", "apple", "banana", "banana"];

const result = [...new Set(items)]
  .reduce((acc, item) => {
    acc[item] = items.filter(i => i === item).length;
    return acc;
  }, {});

console.log(result);
