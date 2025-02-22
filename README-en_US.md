# Cloudboard

Open source Windows & iOS clipboard synchronization tool, supports end-to-end encryption [^1]

[^1]: The data is encrypted using the `AES-256-CBC` algorithm on the client side, and the server cannot obtain the original data content

<p align="center">
  <img alt="demo" src="./docs/preview_en.png" width="500">
</p>
<p align="center">
  English | <a href="./README.md">中文文档</a>
</p>
<p align="center">
  <a href="https://count.getloli.com" target="_blank">
    <img alt="Cloudboard" src="https://count.getloli.com/@Cloudboard.github?name=Cloudboard.github&theme=3d-num&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto">
  </a>
</p>

## Usage

1. [Go to the release page](https://github.com/journey-ad/cloudboard/releases/latest), download and run Cloudboard
   - Fill in the **API Endpoint**, and generate an **API Key**, corresponding to the `api_key` parameter of the shortcut
   - Fill in the **End-to-End Encryption**, corresponding to the `password` parameter of the shortcut

2. Install [Scriptable](https://apps.apple.com/cn/app/scriptable/id1405459188)[^2] on the iOS device
   - Download the [CloudboardEncryptHelper.js](https://raw.githubusercontent.com/journey-ad/cloudboard/master/docs/CloudboardEncryptHelper.js) script, and import it into Scriptable

3. Install the shortcut
   - Get clipboard https://www.icloud.com/shortcuts/b0ccf3de427c4540bf5a6ea9a631219a
   - Send clipboard https://www.icloud.com/shortcuts/8c2e8b9f06484cc98134b807e73a7767

4. Configure the `api_key` and `password` parameters of the shortcut, ensuring consistency with the Windows, and checking if the encryption function has been associated with Scriptable

5. Now the clipboard on the Windows will be automatically synchronized to cloud, and iOS uses the shortcut to synchronize

[^2]: This is an automation tool that can run JS scripts in shortcuts, official website is https://scriptable.app

## Development Notes

This project is developed based on [Tauri](https://tauri.app/), please refer to [Prerequisites](https://v2.tauri.app/zh-cn/start/prerequisites/) to complete the Tauri development environment configuration

Use pnpm + React + Mantine UI

### Common Commands

#### `pnpm install`

Install development dependencies

#### `pnpm dev`
> This is an alias for `pnpm tauri dev`

Start the development environment, running both the frontend and Tauri application, with debugging tools

#### `pnpm rls`
> This is an alias for `pnpm tauri build`

Build the frontend code and package it into a Tauri release version, for generating the final executable file

#### `pnpm update`

Update the dependency package versions in `package.json` and `src-tauri/Cargo.toml`, while cleaning the Rust build files

### Debug

Use `cd src-tauri && cargo clean` to clean the Rust build files to solve some abnormal issues
