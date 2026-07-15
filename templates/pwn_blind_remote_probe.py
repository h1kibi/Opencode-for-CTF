#!/usr/bin/env python3
from pwn import *
import json
import os
import re
import statistics
import time

HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "0"))
REMOTE = os.getenv("REMOTE", "1") == "1"
TIMEOUT = float(os.getenv("TIMEOUT", "2.0"))
CONNECT_RETRIES = int(os.getenv("CONNECT_RETRIES", "3"))
CONNECT_COOLDOWN = float(os.getenv("CONNECT_COOLDOWN", "0.3"))
JITTER_MAX = float(os.getenv("CONNECT_JITTER", "0.0"))

PROBE_REPEATS = int(os.getenv("PROBE_REPEATS", "5"))
SLEEP_BETWEEN_PROBES = float(os.getenv("SLEEP_BETWEEN_PROBES", "0.0"))
SUCCESS_REGEX = os.getenv("SUCCESS_REGEX", "")
FAIL_REGEX = os.getenv("FAIL_REGEX", "")
EXPECT = os.getenv("EXPECT", "")
SEND = os.getenv("SEND", "")
SEND_HEX = os.getenv("SEND_HEX", "")
LINE_MODE = os.getenv("LINE_MODE", "1") == "1"

VERDICT_MODE = os.getenv("VERDICT_MODE", "majority").strip().lower()
MAJORITY_THRESHOLD = int(os.getenv("MAJORITY_THRESHOLD", "0"))
COUNT_TARGET = os.getenv("COUNT_TARGET", "success").strip().lower()
FIRST_HIT_TARGET = os.getenv("FIRST_HIT_TARGET", "success").strip().lower()
JSON_OUT = os.getenv("JSON_OUT", "").strip()

CANDIDATES = os.getenv("CANDIDATES", "").strip()
CANDIDATE_DELIM = os.getenv("CANDIDATE_DELIM", ",")
CANDIDATE_SEND_MODE = os.getenv("CANDIDATE_SEND_MODE", "text").strip().lower()
RANK_BY = os.getenv("RANK_BY", "success_count").strip().lower()
LATENCY_DIRECTION = os.getenv("LATENCY_DIRECTION", "high").strip().lower()
PREFIX = os.getenv("PREFIX", "")
SUFFIX = os.getenv("SUFFIX", "")
POSITION = os.getenv("POSITION", "").strip()
CANDIDATE_FORMAT = os.getenv("CANDIDATE_FORMAT", "").strip()
KNOWN_PREFIX = os.getenv("KNOWN_PREFIX", "")
KNOWN_SUFFIX = os.getenv("KNOWN_SUFFIX", "")
CURRENT_INDEX = os.getenv("CURRENT_INDEX", "").strip()
BYTE_MODE = os.getenv("BYTE_MODE", "0").strip().lower() in {"1", "true", "yes", "on"}
BYTE_START = int(os.getenv("BYTE_START", "0"), 0)
BYTE_END = int(os.getenv("BYTE_END", "255"), 0)
ASCII_SET = os.getenv("ASCII_SET", "").strip()
ASCII_SET_HEX = os.getenv("ASCII_SET_HEX", "0").strip().lower() in {"1", "true", "yes", "on"}
TOP_K = max(1, int(os.getenv("TOP_K", "5")))
STOP_ON_DECISION = os.getenv("STOP_ON_DECISION", "").strip().lower()
EXPORT_BEST_ONLY = os.getenv("EXPORT_BEST_ONLY", "0").strip().lower() in {"1", "true", "yes", "on"}

FLAG_RE = rb"[A-Za-z0-9_@.-]{2,32}\{[^\r\n}]{1,200}\}"

context.log_level = os.getenv("LOG", "info")


def small_jitter(attempt: int) -> float:
    if JITTER_MAX <= 0:
        return 0.0
    return min(JITTER_MAX, abs(hash((time.time(), attempt))) % 1000 / 1000.0 * JITTER_MAX)


def split_candidates() -> list[str]:
    if BYTE_MODE:
        start = max(0, min(255, BYTE_START))
        end = max(0, min(255, BYTE_END))
        if ASCII_SET:
            if ASCII_SET_HEX:
                return [item.strip() for item in ASCII_SET.split(",") if item.strip()]
            return [f"{ord(ch):02x}" for ch in ASCII_SET]
        lo, hi = (start, end) if start <= end else (end, start)
        return [f"{value:02x}" for value in range(lo, hi + 1)]
    if not CANDIDATES:
        return [""]
    delim = "\n" if CANDIDATE_DELIM == r"\n" else CANDIDATE_DELIM
    parts = [item.strip() for item in CANDIDATES.split(delim)]
    return [item for item in parts if item != ""] or [""]


def fill_candidate(template: str, candidate: str) -> str:
    return template.replace("{candidate}", candidate)


def render_candidate(candidate: str) -> str:
    rendered = candidate
    if CANDIDATE_FORMAT:
        rendered = CANDIDATE_FORMAT.replace("{candidate}", candidate)
    if POSITION:
        rendered = f"{KNOWN_PREFIX}{PREFIX}{rendered}{SUFFIX}{KNOWN_SUFFIX}"
    return rendered


def apply_placeholders(template: str, candidate: str) -> str:
    rendered = render_candidate(candidate)
    return (
        template
        .replace("{candidate}", candidate)
        .replace("{rendered_candidate}", rendered)
        .replace("{prefix}", PREFIX)
        .replace("{suffix}", SUFFIX)
        .replace("{known_prefix}", KNOWN_PREFIX)
        .replace("{known_suffix}", KNOWN_SUFFIX)
        .replace("{position}", POSITION)
        .replace("{current_index}", CURRENT_INDEX)
    )


def start_remote():
    if not REMOTE:
        raise SystemExit("pwn_blind_remote_probe.py is intended for REMOTE=1 probing")
    last_exc = None
    for attempt in range(CONNECT_RETRIES + 1):
        try:
            if attempt > 0 and CONNECT_COOLDOWN > 0:
                time.sleep(CONNECT_COOLDOWN + small_jitter(attempt))
            return remote(HOST, PORT, timeout=TIMEOUT)
        except Exception as exc:
            last_exc = exc
            log.warning("connect attempt %d/%d failed: %s", attempt + 1, CONNECT_RETRIES + 1, exc)
    raise SystemExit(f"remote connection failed after {CONNECT_RETRIES + 1} attempts: {last_exc}")


def build_payload(candidate: str) -> bytes:
    rendered = render_candidate(candidate)
    if SEND_HEX:
        raw = apply_placeholders(SEND_HEX, candidate)
        return bytes.fromhex(raw.replace("\\x", "").replace(" ", ""))
    if SEND:
        return apply_placeholders(SEND, candidate).encode()
    if rendered:
        if CANDIDATE_SEND_MODE == "hex":
            return bytes.fromhex(rendered.replace("\\x", "").replace(" ", ""))
        return rendered.encode()
    return b""


def recv_probe(io) -> bytes:
    if EXPECT:
        data = io.recvuntil(EXPECT.encode(), timeout=TIMEOUT)
    else:
        data = b""
    data += io.recvrepeat(TIMEOUT)
    return data


def classify(data: bytes) -> str:
    text = data.decode(errors="replace")
    if re.search(FLAG_RE, data):
        return "flag"
    if SUCCESS_REGEX and re.search(SUCCESS_REGEX, text):
        return "success"
    if FAIL_REGEX and re.search(FAIL_REGEX, text):
        return "fail"
    return "unknown"


def one_probe(candidate: str) -> tuple[str, bytes, float]:
    started = time.perf_counter()
    io = start_remote()
    payload = build_payload(candidate)
    if payload:
        if LINE_MODE:
            io.sendline(payload)
        else:
            io.send(payload)
    data = recv_probe(io)
    latency_ms = (time.perf_counter() - started) * 1000.0
    try:
        io.close()
    except Exception:
        pass
    return classify(data), data, latency_ms


def finalize_decision(stats: dict[str, int]) -> tuple[str, dict]:
    target = COUNT_TARGET if COUNT_TARGET in stats else "success"
    first_target = FIRST_HIT_TARGET if FIRST_HIT_TARGET in stats else "success"
    threshold = MAJORITY_THRESHOLD if MAJORITY_THRESHOLD > 0 else (PROBE_REPEATS // 2 + 1)

    if stats.get("flag", 0) > 0:
        return "flag", {"reason": "flag_observed"}

    if VERDICT_MODE == "first_hit":
        matched = stats.get(first_target, 0) > 0
        return (first_target if matched else "no_hit"), {"target": first_target, "matched": matched}

    if VERDICT_MODE == "count":
        return (
            "threshold_met" if stats.get(target, 0) >= threshold else "threshold_not_met",
            {"target": target, "count": stats.get(target, 0), "threshold": threshold},
        )

    success_count = stats.get("success", 0)
    fail_count = stats.get("fail", 0)
    if success_count >= threshold:
        return "majority_success", {"success": success_count, "fail": fail_count, "threshold": threshold}
    if fail_count >= threshold:
        return "majority_fail", {"success": success_count, "fail": fail_count, "threshold": threshold}
    return "no_majority", {"success": success_count, "fail": fail_count, "threshold": threshold}


def summarize_latency(latencies: list[float]) -> dict:
    return {
        "min_ms": round(min(latencies), 3) if latencies else 0.0,
        "max_ms": round(max(latencies), 3) if latencies else 0.0,
        "mean_ms": round(statistics.mean(latencies), 3) if latencies else 0.0,
        "median_ms": round(statistics.median(latencies), 3) if latencies else 0.0,
    }


def write_json(payload: dict):
    if not JSON_OUT:
        return
    with open(JSON_OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def decision_weight(decision: str) -> int:
    table = {
        "flag": 100,
        "majority_success": 90,
        "threshold_met": 85,
        "success": 80,
        "no_majority": 50,
        "no_hit": 40,
        "threshold_not_met": 20,
        "majority_fail": 10,
        "fail": 5,
        "unknown": 0,
    }
    return table.get(decision, 0)


def rank_metric(candidate_result: dict) -> float:
    stats = candidate_result["stats"]
    latency = candidate_result["latency_summary"]
    if RANK_BY == "success_rate":
        return stats.get("success", 0) / max(1, PROBE_REPEATS)
    if RANK_BY == "fail_count":
        return -float(stats.get("fail", 0))
    if RANK_BY == "mean_latency":
        value = float(latency.get("mean_ms", 0.0))
        return value if LATENCY_DIRECTION == "high" else -value
    if RANK_BY == "median_latency":
        value = float(latency.get("median_ms", 0.0))
        return value if LATENCY_DIRECTION == "high" else -value
    return float(stats.get("success", 0))


def rank_key(candidate_result: dict):
    stats = candidate_result["stats"]
    return (
        decision_weight(candidate_result["decision"]),
        rank_metric(candidate_result),
        -stats.get("fail", 0),
        -stats.get("unknown", 0),
    )


def run_candidate(candidate: str) -> dict:
    stats = {"flag": 0, "success": 0, "fail": 0, "unknown": 0}
    samples = []
    latencies = []

    for idx in range(PROBE_REPEATS):
        verdict, data, latency_ms = one_probe(candidate)
        stats[verdict] += 1
        latencies.append(latency_ms)
        text = data.decode(errors="replace")
        samples.append({
            "idx": idx + 1,
            "candidate": candidate,
            "rendered_candidate": render_candidate(candidate),
            "verdict": verdict,
            "latency_ms": round(latency_ms, 3),
            "preview": text[:200],
        })
        print(f"[{candidate!r} -> {render_candidate(candidate)!r}] [{idx + 1}/{PROBE_REPEATS}] verdict={verdict} latency_ms={latency_ms:.2f}")

        if verdict == "flag":
            m = re.search(FLAG_RE, data)
            if m:
                flag = m.group(0).decode(errors="replace")
                open("agent_flag.txt", "w", encoding="utf-8").write(flag + "\n")
                return {
                    "candidate": candidate,
                    "rendered_candidate": render_candidate(candidate),
                    "decision": "flag",
                    "decision_meta": {"reason": "flag_observed"},
                    "flag": flag,
                    "stats": stats,
                    "latency_summary": summarize_latency(latencies),
                    "samples": samples,
                }

        if STOP_ON_DECISION and verdict == STOP_ON_DECISION:
            break

        if idx + 1 < PROBE_REPEATS and SLEEP_BETWEEN_PROBES > 0:
            time.sleep(SLEEP_BETWEEN_PROBES)

    decision, decision_meta = finalize_decision(stats)
    return {
        "candidate": candidate,
        "rendered_candidate": render_candidate(candidate),
        "decision": decision,
        "decision_meta": decision_meta,
        "stats": stats,
        "latency_summary": summarize_latency(latencies),
        "samples": samples,
    }


def main():
    candidates = split_candidates()
    candidate_results = []

    for candidate in candidates:
        result = run_candidate(candidate)
        candidate_results.append(result)
        if result["decision"] == "flag":
            payload = {
                "mode": VERDICT_MODE,
                "rank_by": RANK_BY,
                "candidate_count": len(candidates),
                "best_candidate": candidate,
                "results": candidate_results,
            }
            write_json(payload)
            print(result["flag"])
            return

    ranked = sorted(candidate_results, key=rank_key, reverse=True)
    best = ranked[0] if ranked else None
    top_results = ranked[:TOP_K]
    position_context = {
        "position": POSITION,
        "current_index": CURRENT_INDEX,
        "known_prefix": KNOWN_PREFIX,
        "known_suffix": KNOWN_SUFFIX,
    }
    payload = {
        "mode": VERDICT_MODE,
        "rank_by": RANK_BY,
        "latency_direction": LATENCY_DIRECTION,
        "candidate_count": len(candidates),
        "best_candidate": best["candidate"] if best else "",
        "best_rendered_candidate": best.get("rendered_candidate", "") if best else "",
        "best_decision": best["decision"] if best else "",
        "position_context": position_context,
        "results": top_results if EXPORT_BEST_ONLY else ranked,
    }
    write_json(payload)

    print("candidate_ranking:")
    for item in top_results:
        stats = item["stats"]
        latency = item["latency_summary"]
        print({
            "candidate": item["candidate"],
            "rendered_candidate": item.get("rendered_candidate", item["candidate"]),
            "decision": item["decision"],
            "position": POSITION,
            "current_index": CURRENT_INDEX,
            "success": stats.get("success", 0),
            "fail": stats.get("fail", 0),
            "unknown": stats.get("unknown", 0),
            "mean_ms": latency.get("mean_ms", 0.0),
            "median_ms": latency.get("median_ms", 0.0),
        })


if __name__ == "__main__":
    main()
