"""Regression tests on known-tricky bodies and subjects."""
from src.cleaning import (clean_body, clean_email, clean_subject, split_quoted_thread,
                          strip_banner, strip_greeting_and_courtesy, strip_signature)
from src.schema import EmailRecord

BANNER = ("WARNING: This email originated outside of our organisation. As a security "
          "measure, please exercise caution with E-Mail content and any links or attachments.")

SIGNATURE = ("\n\nBest Regards,\nWilly Situmorang\nShipping Documentation\n"
             "DID : +971 04 4938289\nAPRIL Fine Paper Trading (Middle East) Fze\n"
             "#813, 4 EA, Dubai Airport Free Zone\n"
             "P.O. Box : 293775, Dubai, United Arab Emirates\n"
             "Website : www.aprilasia.com | www.paperone.com")

THREAD = ("\n\n" + "_" * 30 + "\nFrom: Aziz Tejani <aziztz@safqa.co.ke>\n"
          "Sent: Monday, January 5, 2026 3:14 PM\nSubject: RE: 5RSG-00133\n\n"
          "Please follow the previous instruction. Thank you.")


# --- banner ---------------------------------------------------------------

def test_banner_dropped_when_content_follows():
    text, external = strip_banner(BANNER + "\n\nHi Najiha,\n\nPlease check.")
    assert external
    assert text.startswith("Hi Najiha")
    assert "originated" not in text


def test_banner_kept_when_it_is_the_whole_email():
    # A one-block email that happens to use banner vocabulary must survive.
    body = "Do not click any link in the previous mail, it was sent by mistake."
    text, external = strip_banner(body)
    assert text == body
    assert not external


def test_long_first_block_is_not_a_banner():
    long_block = "Please exercise caution when loading. " * 20
    text, external = strip_banner(long_block + "\n\nMore content.")
    assert text.startswith("Please exercise caution")
    assert not external


def test_external_tag_stripped():
    text, external = strip_banner("[EXTERNAL] Hi team,\n\nSee below.")
    assert external
    assert text.startswith("Hi team")
    text, external = strip_banner("** EXTERNAL ** Hi team")
    assert external and text == "Hi team"


# --- quoted thread --------------------------------------------------------

def test_underscore_rule_cuts_thread():
    head, quoted = split_quoted_thread("Please check." + SIGNATURE + THREAD)
    assert "From: Aziz" not in head
    assert quoted.lstrip("\n_").startswith("From: Aziz")


def test_from_sent_header_cuts_thread_without_rule():
    body = "Noted, thanks.\n\nFrom: A <a@x.com>\nSent: Monday\nSubject: RE: x\n\nold text"
    head, quoted = split_quoted_thread(body)
    assert head.strip() == "Noted, thanks."
    assert "old text" in quoted


def test_original_message_and_on_wrote_markers():
    head, _ = split_quoted_thread("New.\n-----Original Message-----\nOld.")
    assert head.strip() == "New."
    head, _ = split_quoted_thread("New.\nOn Mon, 5 Jan 2026 at 10:00, Bob wrote:\n> Old.")
    assert head.strip() == "New."


def test_from_line_in_body_text_is_not_a_thread():
    # "From:" not followed by "Sent:" is ordinary content.
    body = "From: Jebel Ali\nTo: Mombasa\nPlease book."
    head, quoted = split_quoted_thread(body)
    assert head == body and quoted == ""


# --- signature ------------------------------------------------------------

def test_signature_cut_at_sign_off():
    out = strip_signature("Please check the details and confirm." + SIGNATURE)
    assert out.strip() == "Please check the details and confirm."


def test_address_po_box_inside_si_body_is_not_a_signature():
    # SI_REQUEST bodies embed consignee addresses with P.O. BOX / TEL lines.
    body = ("Please find Shipping instruction for 5RSG-00133.\n\n"
            "Consignee:\nSAFQA LIMITED\nP.O. BOX 99423-80100\nMOMBASA, KENYA\n\n"
            "Notify Party:\nKTP CO., LTD\nSEOUL, SOUTH KOREA\nTEL:02-2285-6025\n\n"
            "Please revert with draft BL once available." + SIGNATURE)
    out = strip_signature(body)
    assert "SAFQA LIMITED" in out
    assert "TEL:02-2285-6025" in out
    assert "Please revert with draft BL once available." in out
    assert "DID" not in out and "Best Regards" not in out


def test_body_without_signature_unchanged():
    body = "Dear All,\n\nPlease find attached the update summary.\n\nRegards,\nDocumentation Team"
    assert strip_signature(body) == body


# --- greeting and courtesy ------------------------------------------------

def test_greeting_and_trailing_thanks_removed():
    out = strip_greeting_and_courtesy("Dear Mitchelle,\n\nPlease send the draft BL.\n\nThank you.")
    assert out == "Please send the draft BL."


def test_greeting_without_comma():
    out = strip_greeting_and_courtesy("Hi Najiha\n\nPlease find Shipping instruction.")
    assert out == "Please find Shipping instruction."


def test_greeting_only_email_is_kept():
    assert strip_greeting_and_courtesy("Thanks.") == "Thanks."


# --- end to end body ------------------------------------------------------

def test_full_body_pipeline():
    raw = (BANNER + "\n\nDear Mitchelle,\n\nPlease assist to send the draft BL for "
           "BKG123 for checking asap.\n\nThank you." + SIGNATURE + THREAD)
    body, quoted, external = clean_body(raw)
    assert body == "Please assist to send the draft BL for BKG123 for checking asap."
    assert external
    assert "Please follow the previous instruction" in quoted


def test_spam_body_survives_cleaning():
    raw = "CONGRATULATIONS!!! Click here to claim your $1,000 gift card now: http://bit.ly/x"
    body, quoted, external = clean_body(raw)
    assert body == raw and quoted == "" and not external


# --- subject --------------------------------------------------------------

def test_subject_prefixes_stripped():
    assert clean_subject("RE_ TO CONFIRM DOCS _ 5RSG") == ("TO CONFIRM DOCS _ 5RSG", True)
    assert clean_subject("RE: FW: FWD: AW: hello") == ("hello", True)
    assert clean_subject("[EXTERNAL] RE_ SI - X") == ("SI - X", True)
    assert clean_subject("REQUEST SI _ OC") == ("REQUEST SI _ OC", False)


def test_subject_prefix_needs_delimiter():
    # "RETURN" / "REQUEST" must not lose their "RE".
    assert clean_subject("REQUEST BL DRAFT")[0] == "REQUEST BL DRAFT"
    assert clean_subject("Reminder_Paper")[0] == "Reminder_Paper"


def test_clean_email_sets_external_from_subject_tag():
    rec = EmailRecord("email_x", "a@b.com", "[EXTERNAL] Hello", "Body text.", [])
    cleaned = clean_email(rec)
    assert cleaned.is_external
    assert cleaned.subject_clean == "Hello"
