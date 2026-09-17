import contextlib
import copy
import io
import json
import unittest
from unittest.mock import patch, MagicMock
import urllib.error

import compare as c


def jev():
    return {"answers": {"tier": {"type": "choice", "choice": "fast", "confidence": 0.9,
            "probabilities": {"fast": 0.9, "balanced": 0.05, "deep": 0.05}},
            "needs_clarification": {"type": "noul", "noul": 0.2}},
            "usage": {"input_tokens": 12, "output_tokens": 4}}


def openai():
    return {"status": "completed", "output": [{"type": "message", "content": [
        {"type": "output_text", "text": json.dumps({"tier": "fast", "needs_clarification": False})}]}]}


class ComparisonTests(unittest.TestCase):
    def test_payload_contract_and_shared_rubric(self):
        case = dict(c.CASES[0], provisional_label="NEVER_SEND")
        j, o = [c.payload(p, case, "explicit-model") for p in c.URLS]
        self.assertEqual(j["model"], "explicit-model")
        self.assertEqual(j["questions"]["tier"]["type"], "choice")
        self.assertEqual(j["questions"]["needs_clarification"]["type"], "noul")
        self.assertEqual(j["state"], json.loads(o["input"][1]["content"]))
        rubric = json.loads(o["input"][0]["content"])
        for key, q in j["questions"].items():
            self.assertEqual(rubric[key], {k: q[k] for k in ("instructions", "criteria")})
        self.assertNotIn("NEVER_SEND", json.dumps([j, o]))
        schema = o["text"]["format"]
        self.assertTrue(schema["strict"])
        self.assertFalse(schema["schema"]["additionalProperties"])
        self.assertEqual(schema["schema"]["required"], ["tier", "needs_clarification"])

    def test_valid_parsing_and_threshold(self):
        self.assertEqual(c.parse("openai", openai())["tier"], "fast")
        body = jev()
        body["answers"]["needs_clarification"]["noul"] = 0.5
        self.assertTrue(c.parse("jev", body)["needs_clarification"])

    def test_invalid_probabilities(self):
        for p in (float("nan"), float("inf"), -0.1, 1.1, True, "0.5", None):
            with self.subTest(p=p), self.assertRaises(c.Failure):
                body = jev()
                body["answers"]["needs_clarification"]["noul"] = p
                c.parse("jev", body)

    def test_bad_choice_and_distribution(self):
        for field, value in (("choice", "ultra"), ("confidence", float("nan")),
                             ("probabilities", {"fast": 1}),
                             ("probabilities", {"fast": 1, "balanced": 1, "deep": 1})):
            body = jev()
            body["answers"]["tier"][field] = value
            with self.subTest(field=field), self.assertRaises(c.Failure):
                c.parse("jev", body)

    def test_missing_malformed_refusal_incomplete(self):
        for provider in c.URLS:
            for body in ({}, [], None):
                with self.subTest(provider=provider, body=body), self.assertRaises(c.Failure):
                    c.parse(provider, body)
        variants = [dict(openai(), status="incomplete"), dict(openai(), output=[])]
        for content in ({"type": "refusal", "refusal": "SECRET"},
                        {"type": "output_text", "text": "not json"},
                        {"type": "output_text", "text": '{"tier":"deep","needs_clarification":"false"}'},
                        {"type": "output_text", "text": '{"tier":"other","needs_clarification":false}'},
                        {"type": "output_text", "text": '{"tier":"fast","needs_clarification":false,"extra":1}'}):
            body = openai()
            body["output"][0]["content"] = [content]
            variants.append(body)
        for body in variants:
            with self.assertRaises(c.Failure) as caught:
                c.parse("openai", body)
            self.assertNotIn("SECRET", str(caught.exception))

    def test_http_errors_are_redacted_and_not_retried(self):
        opener = MagicMock()
        opener.open.side_effect = urllib.error.HTTPError("url", 429, "SECRET", {}, io.BytesIO(b"SECRET"))
        with patch.object(c.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(c.Failure, "^http_429$"):
                c.post("jev", {}, "fake-key", 2)
        opener.open.assert_called_once()
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, c.URLS["jev"])
        self.assertEqual(request.get_header("Authorization"), "Bearer fake-key")

    def test_transport_bad_json_timeout_and_redirect(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = b"not json"
        with patch.object(c.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(c.Failure, "invalid_json"):
                c.post("openai", {}, "fake", 1)
            opener.open.side_effect = TimeoutError("SECRET")
            with self.assertRaisesRegex(c.Failure, "transport_error"):
                c.post("openai", {}, "fake", 1)
        with self.assertRaisesRegex(c.Failure, "redirect_rejected"):
            c.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com")

    def test_dry_run_reads_no_provider_environment_or_network(self):
        def guard(name, default=None):
            if name in ("TYPESAFE_API_KEY", "OPENAI_API_KEY", "AIDA_JEV_MODEL", "AIDA_OPENAI_MODEL"):
                raise AssertionError("provider environment read")
            return default  # argparse may inspect locale/terminal settings.
        with patch.object(c.os.environ, "get", side_effect=guard), \
             patch.object(c.urllib.request, "build_opener", side_effect=AssertionError("network")), \
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(c.main([]), 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["network_requests"], 0)
        self.assertNotIn("rows", report)
        self.assertEqual(len(report["cases"]), 7)

    def test_missing_configuration_fails_before_request(self):
        for env in ({}, {"TYPESAFE_API_KEY": "fake", "AIDA_JEV_MODEL": "jev", "AIDA_OPENAI_MODEL": "chosen"}):
            with patch.dict(c.os.environ, env, clear=True), patch.object(c, "run") as run, \
                 contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                c.main(["--live"])
            run.assert_not_called()

    def test_bounded_cli(self):
        for args in (["--repeats", "0"], ["--repeats", "11"], ["--timeout", "nan"]):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                c.main(args)

    def test_metrics_and_alternating_order(self):
        calls = []
        def mock(provider, data, key, timeout):
            calls.append(provider)
            return copy.deepcopy(jev() if provider == "jev" else openai())
        rows = c.run({"jev": "j", "openai": "o"}, {"jev": "fake", "openai": "fake"}, 2, 1, mock)
        self.assertEqual(calls[:4], ["jev", "openai", "openai", "jev"])
        self.assertEqual(calls[14:16], ["openai", "jev"])
        summary = c.summarize(rows)
        self.assertEqual(summary["paired_successes"], 14)
        for i, row in enumerate(rows):
            row["latency_ms"] = 10 if row["provider"] == "jev" else 20
        self.assertEqual(c.summarize(rows)["jev"]["median_success_latency_ms"], 10)
        self.assertEqual(summary["provider_agreements"], 14)
        self.assertEqual(summary["jev"]["provisional_label_agreements"], 6)
        rows[0]["result"]["tier"] = "deep"
        rows[2].update(status="error", error="http_429")
        summary = c.summarize(rows)
        self.assertEqual(len(summary["disagreements"]), 1)
        self.assertEqual(summary["openai"]["errors"], 1)
        self.assertEqual(summary["paired_successes"], 13)
        self.assertIsNone(c.summarize([])["jev"]["median_success_latency_ms"])

    def test_failed_requests_and_usage(self):
        def mock(*args):
            raise c.Failure("transport_error")
        rows = c.run({"jev": "j", "openai": "o"}, {"jev": "fake", "openai": "fake"}, 1, 1, mock)
        self.assertEqual(c.summarize(rows)["jev"]["errors"], 7)
        self.assertTrue(all(r["latency_ms"] >= 0 and r["usage"] is None for r in rows))
        self.assertEqual(c.usage(jev()), {"input_tokens": 12, "output_tokens": 4})
        self.assertIsNone(c.usage(openai()))
        self.assertEqual(c.usage({"usage": {"input_tokens": "SECRET", "text": "SECRET"}}), {})


if __name__ == "__main__":
    unittest.main()
