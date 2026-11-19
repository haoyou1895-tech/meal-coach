import Taro from "@tarojs/taro";

/**
 * 上传前把照片压小。
 *
 * 为什么要这一步：手机原图四五千像素、三四兆，
 * 传到识别接口既慢又费流量，而模型看一张 720px 的图已经足够判断。
 * **这不是优化，是必须**：实测原图直接发，请求体 1.1MB，
 * 服务端等模型 40 秒还超时，回来是 502。
 *
 * 小程序用系统自带的 compressImage；
 * h5 没有这个 API（Taro 直接标了 temporarilyNotSupport），退回 canvas 压，
 * 这样本地预览也能完整跑通一次识别。
 */
/** Taro 编译时会把这个常量换成字面量；万一没换，也不能让 process 未定义把页面炸掉 */
const IS_H5 = (() => {
  try {
    return process.env.TARO_ENV === "h5";
  } catch {
    return false;
  }
})();

export async function compressPath(
  tempFilePath: string,
  quality = 72,
): Promise<string> {
  if (IS_H5) {
    try {
      const src = tempFilePath.startsWith("blob:")
        ? await blobToDataUrl(tempFilePath)
        : tempFilePath;
      return await compressWithCanvas(src, quality / 100);
    } catch {
      return tempFilePath;
    }
  }

  try {
    const res = await Taro.compressImage({
      src: tempFilePath,
      quality,
      compressedWidth: 720,
    });
    return res.tempFilePath || tempFilePath;
  } catch {
    // 压不了就用原图，识别慢一点好过拍完报错
    return tempFilePath;
  }
}

/**
 * 拿到可以直接发给接口的 dataURL。
 * 小程序读文件；h5 的压缩结果本身就是 dataURL，原样返回。
 */
export async function pathToDataUrl(tempFilePath: string): Promise<string | null> {
  if (tempFilePath.startsWith("data:")) return tempFilePath;
  if (tempFilePath.startsWith("blob:")) return blobToDataUrl(tempFilePath);
  try {
    const b64 = Taro.getFileSystemManager().readFileSync(tempFilePath, "base64");
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

/* ---------- 只在 h5 用的两段，小程序里不会被打到 ---------- */

function blobToDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url);
    xhr.responseType = "blob";
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(xhr.response);
    };
    xhr.onerror = reject;
    xhr.send();
  });
}

function compressWithCanvas(dataUrl: string, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
