import Taro from "@tarojs/taro";

/**
 * 上传前把照片压小。
 *
 * 为什么要这一步：手机原图四五千像素、三四兆，
 * 传到识别接口既慢又费流量，而模型看一张 720px 的图已经足够判断。
 * 网页版用 canvas 压，小程序用系统自带的 compressImage，不用自己算。
 */
export async function compressPath(
  tempFilePath: string,
  quality = 72,
): Promise<string> {
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

/** 读成 base64，接口要 dataURL 时用 */
export async function pathToDataUrl(tempFilePath: string): Promise<string | null> {
  try {
    const res = Taro.getFileSystemManager().readFileSync(tempFilePath, "base64");
    return `data:image/jpeg;base64,${res}`;
  } catch {
    return null;
  }
}
