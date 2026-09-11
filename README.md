# 蓝色 3D 地图（Blue Atlas 3D）

参考用户提供的视频重建的独立 WebGL 场景。使用静态 HTML、CSS、JavaScript 与 Three.js r160，无后端。

## 分享与发布

公开网站：https://li-design-lab.github.io/3d--/ 。请分享这个地址，不要分享 `127.0.0.1` 或旧的 `chatgpt.site` 地址。

源码在 `main`，网站从独立 `gh-pages` 分支发布。仅更新 `main` 不会自动上线，需运行 `node scripts/prepare-pages.mjs`，将生成的完整静态目录同步到 `gh-pages` 并等待 Pages 发布成功。当前 GitHub 凭证不能写入 Actions 工作流，因此使用分支发布，不扩大凭证权限。左上角“下钻版”后显示当前发布的源码提交短号；`release.json` 可查看完整版本。部署包含按需加载的边界和雷达资源，而非仅发布 Vite 的 JavaScript 包。源码仓库按用户授权改为公开。

## 功能
- 中国地图挤出、边缘高亮、动态侧壁、透视网格与旋转光环。
- 拖动旋转、滚轮缩放、放大、缩小、俯视、环绕、复位与全屏。
- 全国 34 个省级区域可单独进入；支持省 → 市 → 区县、面包屑跳转和逐级返回，直辖市直接进入区县。边界按需从本地加载，不依赖运行时外网边界接口。
- 飞线、事件标签、重点点位、热力图层与散点独立开关；原行政地图和地球的业务点位为演示数据。公开公路专题使用独立生成的演示数据，雷达使用已有产品。
- 已叠加一份真实雷达组合反射率（CREF）产品：2026-08-26 00:54–02:12，覆盖 73–135°E、12.2–54.2°N，最大 44.39 dBZ。图像采用 Web Mercator 重采样，与立体地图经纬度对齐。
- 地球视图使用纹理球体、云层、辉光、城市标签与弧线。

## 素材与依赖
- Three.js 0.160.1 和 OrbitControls：MIT，https://github.com/mrdoob/three.js
- 地球贴图来自 Three.js examples/textures/planets：https://threejs.org/examples/
- 全国省界使用用户提供的《中国_省.geojson》（34 个省级面、8 组境界线，原文件标注 EPSG:4490，经纬度坐标保持不变）。市、区县边界来自既有素材及阿里云 DataV GeoAtlas：https://datav.aliyun.com/portal/school/atlas/area_selector 。边界版本未统一核定，不用于法定界线认定。
- 视觉参考为用户提供的 55 秒演示视频。没有使用原案例源码或从视频截图充当界面。

## 当前边界
为视觉与交互的第一版重建，并非原项目的逐像素复制。材质、光晕与镜头路径为重新实现。视频未展示的业务行为未添加。

本机日常使用桌面 `打开蓝色3D地图.command`，它会检查或恢复常驻服务后打开 Chrome。固定地址为 http://127.0.0.1:5174/?scene=g214 ，不依赖终端或 Codex 会话存活。服务仅监听本机，登录后自动启动，意外退出自动恢复。

首次安装或同步修改后的本地版本：`npm run local:install`。查看运行状态：`npm run local:status`。停止本次登录期间的服务：`npm run local:stop`；恢复：`npm run local:start`。移除登录自启：`node scripts/manage-local-service.mjs uninstall`（保留安装文件）。运行文件位于 `~/Library/Application Support/Blue Atlas 3D/`，日志位于 `~/Library/Logs/Blue Atlas 3D/`。桌面源目录移动后已安装版本仍可运行，但更新需要从新源码目录重新安装。

开发调试运行 `npm install`、`npm run dev`，地址为 http://127.0.0.1:5176/ ，与日常服务分开。也可通过 HTTP 静态服务提供 `dist/client` 目录，不能直接双击 HTML。

## 行政区数据与已知限制

- 当前索引包含 363 份区域视图，数据位于 `dist/client/assets/regions/manifest.json`。每次只加载当前区域；失败后保留原地图，可重试。
- 台湾省可单独查看，但当前来源没有下级边界；其他省级区域已打包现有下级边界。直辖市及省直辖县级区按数据实际层级导航。
- **尚未提供乡镇面边界。** 区县可进入独立视图，再往下会明确显示“暂缺乡镇边界”，不会用模拟多边形冒充乡镇。
- 若补充某区县的乡镇边界，将包含该县全部乡镇的 FeatureCollection 存为 `dist/client/assets/<区县行政代码>.json`。每个乡镇须有唯一的 `properties.adcode`、`properties.name`、`properties.level: "town"` 及真实经纬度 Polygon/MultiPolygon；重新生成索引即可继续下钻。
- 雷达保持原产品经纬度位置，并按当前区域轮廓裁切；下钻不会生成更高分辨率雷达数据，无回波区域允许为空。

更新省界与索引（不联网）：

```bash
node scripts/prepare-regions.mjs /path/to/中国_省.geojson
```

增加 `--fetch-cities` 可尝试补齐缺失的省、市子级集合。不会自动生成乡镇数据。

回归检查：`node --test scripts/regions.test.mjs`、`npm run build`。

2026-09-09 本地浏览器实测：34 个省级入口逐一进入并返回；四川 → 成都 → 锦江区链路通过。此验证不代表旧 chatgpt.site 公网链接恢复。

## 公路资产与公开数据

全国 → 西藏自治区 → 昌都市 → 卡若区 → 公路资产，可连续下钻；同时提供快捷入口和 `?scene=g214`。公路资产是业务图层，不是乡镇行政层级，养护范围也不等于区县界线。

公开仓库及网站只包含独立数学曲线生成的演示线路、示例桥梁和示例桩号，明确标注“演示数据 · 非真实道路”。它没有使用原始表格、原始路线几何或经过偏移的原坐标。真实数据仅保存在本机忽略目录 `.private/road.json`，安装器将其覆盖到仅监听回环地址的本机服务副本；开发和发布目录始终使用演示数据。

运行 `node scripts/generate-road-demo.mjs` 可复现演示数据；`node scripts/audit-public.mjs` 检查公开素材。发布前运行测试、构建和审计，禁止把本机安装副本、`.private/`、原始表格和浏览器证据加入 Git 或部署目录。

道路保持点位间直线连接，县界使用完整已有边界并渐隐，视觉高度没有高程含义。提供搜索、类型筛选、点选详情、图层切换、巡览和来源口径。本机版保留原始数值并显示疑点，不自动修正坐标。

## 雷达数据更新方法

真实 NetCDF 原文件不会提交到仓库；浏览器加载的是生成后的透明 PNG 和元数据，位于 `dist/client/assets/radar/`。要替换为新产品，可安装 Python 的 `netCDF4`、NumPy 和 Pillow 后运行：

```bash
python3 scripts/build_radar_overlay.py /path/to/your-product.nc
```

脚本会输出 Web Mercator 投影的图层贴图及 JSON 元数据。更新产品时间或文件名时，请同步修改 `dist/client/app.js` 中的 `radarProduct`。

## 第二版视觉重建
- 修复全国构图将南海岛礁纳入自动缩放造成的主体过小；岛礁仍保留，主视图按北纬 18 度以北校准。
- 使用独立顶面/侧壁着色器、3.6 单位地图厚度与细密动态侧壁纹理。
- 增加后处理辉光与输出色彩变换；告警点位采用立体菱形、多层脉冲底座与渐隐光柱。
- 热力层改为按真实边界遮罩裁切的起伏曲面；中心增加旋转刻度环与扫描筒。
- 地球增加地理投影的中国省界、分层大气辉光、动态飞线、六边形遥测环带与分图层控制。
- 中国与地球之间新增双阶段镜头过渡；沿用原网址和访问范围。

验证：JavaScript 语法、13 个模块的依赖闭包、68 份地理数据资源、地图投影的屏幕范围。云端浏览器已尝试加载，但其 WebGL 被运行环境禁用，未完成实际 GPU 画面或交互验收；不宣称达到逐帧/逐像素一致。

## 地球外层光效修订
- 将固定圆筒替换为半径为地球约 1.19 倍的球面蜂窝扫描罩，扫描边缘自北向南循环移动，并随尾迹渐隐。
- 外侧粒子轨道直径约为地球的 2.43 倍，加入倾角变化、流动高光与细粒子。
- 光效随“粒子光环”开关控制；进入地球时重新开始扫描。
- 保留 WebGL 渲染器及三维场景，不关闭 WebGL。
- 已检查新增模块语法和依赖连接；实际 GPU 视觉验收仍未完成。
