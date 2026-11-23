# GOJO Harness

给 DeepSeek Harness 换上冷白蓝泼墨、Yuji Boku 字体和冰焰琉璃唱盘。流式回复会随机出现苍、赫、茈三种能量球，分叉时可在符纸上快速回看原对话。主题沿用宿主按钮、面板、会话分叉和模型设置。

非官方同人插件。首版兼容基线为 **macOS · DeepSeek Harness 0.2.2-rc.1**。

## 安装

从 [GitHub Releases](https://github.com/Poseima/dsh-plugin-gojo-theme/releases/latest) 下载 `dsh-plugin-gojo-theme-0.3.46.tgz`。可同时下载 `SHA256SUMS.txt`，在下载目录运行 `shasum -a 256 -c SHA256SUMS.txt` 验证。

先保存手头的工作并完全退出 DSH，再在下载目录执行下列命令。安装完成后重新打开 DSH。首次安装插件前，请至少打开过一次 DSH。更新时下载新安装包，再用同一命令安装新文件。

```sh
dsh plugin --profile desktop add "$PWD/dsh-plugin-gojo-theme-0.3.46.tgz"
```

如果终端找不到 `dsh`，可使用 macOS 应用自带的命令。以下示例假设 DSH 安装在 `/Applications`。

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "$PWD/dsh-plugin-gojo-theme-0.3.46.tgz"
```

完全退出 DSH 后执行卸载，再重新打开即可恢复宿主样式。

```sh
dsh plugin --profile desktop remove dsh-plugin-gojo-theme
```

## 导入本地素材

插件装好即可使用视觉主题和动效。唱盘、语音和开场使用你提供的本地文件。

```sh
mkdir -p ~/.config/gojo-harness/media/{records,voices,spell-voices,fork-domain}
open ~/.config/gojo-harness/media
```

把文件按下表命名放入该目录，重新打开 DSH。扩展名表示实际格式，单纯修改文件名不会转换格式。可以只导入想用的项目。

| 相对路径 | 效果 |
| --- | --- |
| `portrait.png` | 自定义侧栏头像。留空时显示内置六眼标记。 |
| `intro.mp4` | 启动时全窗播放一次。建议 H.264 视频、AAC 音频，最长 30 秒。可按 Esc 或点击「跳过」。 |
| `records/specialz.m4a` | 唱盘曲目 SPECIALZ。 |
| `records/kaikai-kitan.m4a` | 唱盘曲目 廻廻奇譚。 |
| `records/where-our-blue-is-acoustic.m4a` | 唱盘曲目 青のすみか (Acoustic)。 |
| `spell-voices/blue.m4a`、`spell-voices/red.m4a`、`spell-voices/purple.m4a` | 对应苍、赫、茈，在回合开始时随选中的术式播放。 |
| `voices/here-we-go.m4a`、`voices/stay-close.m4a`、`voices/dont-be-shy.m4a`、`voices/let-me-show-off.m4a`、`voices/im-the-strongest.m4a` | 助手成功完成回复时，从已导入的文件中随机播放。 |
| `fork-domain/voice.m4a`、`fork-domain/scan.m4a` | 点击分叉时的语音，以及问答快扫时的音效。 |

M4A 建议使用 AAC 编码。唱盘的曲目列表只显示已导入的曲目。鼠标悬停或键盘聚焦时显示播放控件。分叉快扫可按 Esc 或点击右上角「跳过」，历史内容只在本地临时渲染。卸载插件后，本地素材目录仍可手动保留或清理。

## 从源码构建

使用 Node.js 22 或更高版本。

```sh
npm ci
npm test
npm run pack:local
```

安装包生成在 `dist/`。源码许可见 [MIT](LICENSE)，字体和美术的来源见 [素材清单](ASSETS.md)。
