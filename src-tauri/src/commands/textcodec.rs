//! 文本编码与换行符处理：支持常见中/日/韩/西欧编码的检测、解码与编码。

use encoding_rs::Encoding;

/// 按 id 取编码（与前端 ENCODINGS 列表保持一致）
pub fn encoding_by_id(id: &str) -> &'static Encoding {
    match id {
        "utf-8" | "utf-8-bom" => encoding_rs::UTF_8,
        "gb18030" | "gbk" | "gb2312" => encoding_rs::GB18030,
        "big5" => encoding_rs::BIG5,
        "shift_jis" | "sjis" => encoding_rs::SHIFT_JIS,
        "euc-kr" => encoding_rs::EUC_KR,
        "utf-16le" => encoding_rs::UTF_16LE,
        "utf-16be" => encoding_rs::UTF_16BE,
        "windows-1252" | "latin1" => encoding_rs::WINDOWS_1252,
        _ => encoding_rs::UTF_8,
    }
}

/// 检测编码：BOM 优先，其次严格 UTF-8，最后回退 GB18030（兼容 GBK/GB2312）
pub fn detect_encoding(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return "utf-8-bom";
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return "utf-16le";
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return "utf-16be";
    }
    if std::str::from_utf8(bytes).is_ok() {
        return "utf-8";
    }
    "gb18030"
}

/// 按指定编码解码（自动去掉对应 BOM）
pub fn decode_with(bytes: &[u8], encoding: &str) -> String {
    match encoding {
        // UTF-16 手工解码：BOM 之后按 2 字节单元还原
        "utf-16le" | "utf-16be" => {
            let little = encoding == "utf-16le";
            let mut data = bytes;
            if data.starts_with(&[0xFF, 0xFE]) || data.starts_with(&[0xFE, 0xFF]) {
                data = &data[2..];
            }
            let units: Vec<u16> = data
                .chunks_exact(2)
                .map(|c| {
                    if little {
                        u16::from_le_bytes([c[0], c[1]])
                    } else {
                        u16::from_be_bytes([c[0], c[1]])
                    }
                })
                .collect();
            String::from_utf16_lossy(&units)
        }
        "utf-8-bom" => {
            let data = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
                &bytes[3..]
            } else {
                bytes
            };
            let (text, _, _) = encoding_rs::UTF_8.decode(data);
            text.into_owned()
        }
        _ => {
            let (text, _, _) = encoding_by_id(encoding).decode(bytes);
            text.into_owned()
        }
    }
}

/// 按指定编码编码（UTF-8 可补 BOM；UTF-16 手工写入 BOM）
pub fn encode_with(text: &str, encoding: &str) -> Vec<u8> {
    match encoding {
        "utf-16le" | "utf-16be" => {
            let little = encoding == "utf-16le";
            let mut out = Vec::with_capacity(text.len() * 2 + 2);
            out.extend_from_slice(if little { &[0xFF, 0xFE] } else { &[0xFE, 0xFF] });
            for unit in text.encode_utf16() {
                let bytes = if little {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                };
                out.extend_from_slice(&bytes);
            }
            out
        }
        _ => {
            let (bytes, _, _) = encoding_by_id(encoding).encode(text);
            let mut out = bytes.into_owned();
            if encoding == "utf-8-bom" && !out.starts_with(&[0xEF, 0xBB, 0xBF]) {
                let mut with_bom = vec![0xEF, 0xBB, 0xBF];
                with_bom.extend_from_slice(&out);
                out = with_bom;
            }
            out
        }
    }
}

/// 检测换行符：crlf / cr / lf
pub fn detect_eol(text: &str) -> &'static str {
    if text.contains("\r\n") {
        "crlf"
    } else if text.contains('\r') {
        "cr"
    } else {
        "lf"
    }
}

/// 统一转换为指定换行符
pub fn normalize_eol(text: &str, eol: &str) -> String {
    let lf = text.replace("\r\n", "\n").replace('\r', "\n");
    match eol {
        "crlf" => lf.replace('\n', "\r\n"),
        "cr" => lf.replace('\n', "\r"),
        _ => lf,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_utf8_and_gbk() {
        assert_eq!(detect_encoding("中文 abc".as_bytes()), "utf-8");
        let (gbk, _, _) = encoding_rs::GB18030.encode("中文内容");
        assert_eq!(detect_encoding(&gbk), "gb18030");
        assert_eq!(decode_with(&gbk, "gb18030"), "中文内容");
    }

    #[test]
    fn roundtrip_with_bom() {
        for enc in ["utf-8-bom", "utf-16le", "utf-16be", "gb18030"] {
            let encoded = encode_with("标题\n正文 line 2\n", enc);
            assert_eq!(decode_with(&encoded, enc), "标题\n正文 line 2\n", "编码 {enc}");
            assert_eq!(detect_encoding(&encoded), enc, "检测 {enc}");
        }
    }

    #[test]
    fn eol_detection_and_conversion() {
        assert_eq!(detect_eol("a\r\nb"), "crlf");
        assert_eq!(detect_eol("a\nb"), "lf");
        assert_eq!(detect_eol("a\rb"), "cr");
        assert_eq!(normalize_eol("a\r\nb\rc\nd", "crlf"), "a\r\nb\r\nc\r\nd");
        assert_eq!(normalize_eol("a\r\nb", "lf"), "a\nb");
    }
}
