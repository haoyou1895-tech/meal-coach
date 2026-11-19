import { PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 这里暂时什么都不做。以后要加「启动时检查是不是该称体重了」放这儿。
  });

  return children;
}

export default App;
