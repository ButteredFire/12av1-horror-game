export function randRange(min, max) { return Math.random() * (max - min) + min; }
export function randRangeInt(min, max) { return Math.round(randRange(min, max).toFixed(0)); }

export function randElem(arr) {
    return arr[randRangeInt(0, arr.length - 1)];
}