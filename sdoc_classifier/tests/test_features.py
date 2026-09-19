"""Coded-subject discriminator and engineered flags."""
from src.features import attachment_flags, featurize
from src.patterns import coded_subject_kind
from src.schema import EmailRecord


def test_coded_si_subject():
    s = "SI - MEDUUD104332 - DIRECT(MSC) - 5RSG-00133 - CALLAO_PERU - OBL - AIE - 5-Jan-26"
    assert coded_subject_kind(s) == "si"


def test_coded_dept_subject_any_department_code():
    # The BL format's first field is a department code, not always AIE.
    for dept in ["AIE", "AFPTME", "AFRT", "AFEMY", "ZZZ"]:
        s = f"{dept} - CALLAO_PERU - MSC(MEDU123) - 5RSG-00133 - 5250078941 - ACME LTD - LC"
        assert coded_subject_kind(s) == "dept", dept


def test_multiword_first_field_is_not_coded():
    assert coded_subject_kind(
        "REQUEST TO CANCEL INVOICE -5250 - ACME LTD - 5RSG-00133 - X - Y") is None
    assert coded_subject_kind("LOCAL CHARGES FOB - JETSEA - 5RSG-00133 - TELEX RELEASE") is None
    assert coded_subject_kind("Total Freight - INDIA - 5RSG-00133") is None


def test_attachment_flags():
    f = attachment_flags(["attachments/email_001_SI.xlsx", "attachments/email_001_BL.docx"])
    assert f == {"n_attachments": 2, "has_si_file": 1, "has_bl_file": 1, "has_doc_pair": 1}
    f = attachment_flags(["attachments/email_507_SI.txt"])
    assert f["has_si_file"] == 1 and f["has_doc_pair"] == 0
    assert attachment_flags([])["n_attachments"] == 0


def test_reminder_subject_hits_general_despite_underscores():
    rec = EmailRecord("e", "hr@aprilasia.com", "_Reminder_Paper - Submit SI & AED_05-01-2026",
                      "Reminder: Please submit SI & AED for all pending shipments.", [])
    flags = featurize(rec).flags
    assert flags["subject_hit_GENERAL"] >= 1
    assert flags["sender_is_internal"] == 1


def test_compare_request_without_attachments_hits_bl_body():
    rec = EmailRecord("e", "x@y.com", "AIE - A - B(C) - D - E - F - LC",
                      "Dear Team,\n\nPlease compare the SI and draft BL for 0705 and confirm.", [])
    flags = featurize(rec).flags
    assert flags["coded_prefix_dept"] == 1
    assert flags["body_hit_BL_COMPARISON"] >= 1
