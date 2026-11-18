import { webview } from '@kit.ArkWeb';

/**
 * 餐谋 · 鸿蒙壳
 *
 * 就是一行网址，外面套一层原生窗口。
 * 网页本身不改，改的是「谁来显示它」：
 * 浏览器不给的能力（忽略证书错误、无地址栏全屏），原生壳可以给。
 */
const HOME_URL: string = 'https://canmou.net.cn';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private loading: boolean = true;

  onBackPress(): boolean {
    // 网页里能后退就先退网页，退到底了才退出 App
    if (this.controller.accessBackward()) {
      this.controller.backward();
      return true;
    }
    return false;
  }

  build() {
    Stack() {
      Web({ src: HOME_URL, controller: this.controller })
        .javaScriptAccess(true)
        // localStorage 必须开，关掉的话网页里的记录全废
        .domStorageAccess(true)
        // IndexedDB 必须开，照片存在这里
        .databaseAccess(true)
        .fileAccess(false)
        .geolocationAccess(false)
        .mixedMode(MixedMode.None)
        .zoomAccess(true)
        .horizontalScrollBarAccess(false)
        .verticalScrollBarAccess(false)
        // 证书报错时不让用户看到白屏，直接继续加载
        .onSslErrorEventReceive((event) => {
          event.handler.handleConfirm();
        })
        .onPageEnd(() => {
          this.loading = false;
        })
        .width('100%')
        .height('100%')

      if (this.loading) {
        Column() {
          LoadingProgress()
            .width(44)
            .height(44)
            .color('#2f7d5a')
          Text('餐谋')
            .fontSize(15)
            .fontColor('#8a8578')
            .margin({ top: 12 })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor('#f7f6f2')
      }
    }
    .width('100%')
    .height('100%')
  }
}
