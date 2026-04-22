import io
from datetime import date

import duckdb
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Cadrage TVA Cabinet", layout="wide")


# ---------- Helpers ----------
def table_exists(con: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    q = """
    SELECT 1
    FROM information_schema.tables
    WHERE lower(table_name) = lower(?)
    LIMIT 1
    """
    return con.execute(q, [table_name]).fetchone() is not None


def table_columns(con: duckdb.DuckDBPyConnection, table_name: str) -> list[str]:
    return [r[0] for r in con.execute(f"SELECT * FROM {table_name} LIMIT 0").description]


def pick_col(cols: list[str], candidates: list[str]) -> str | None:
    lower_map = {c.lower(): c for c in cols}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


def pick_expr(cols: list[str], candidates: list[str], default: str = "NULL") -> str:
    found = [pick_col(cols, [c]) for c in candidates]
    found = [c for c in found if c]
    if not found:
        return default
    if len(found) == 1:
        return f'"{found[0]}"'
    return "COALESCE(" + ", ".join(f'"{c}"' for c in found) + ")"


def ensure_mapping_table(con: duckdb.DuckDBPyConnection):
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS vat_account_mapping (
            mapping_id BIGINT,
            company_id VARCHAR,
            account_prefix VARCHAR,
            vat_category VARCHAR,
            direction VARCHAR,
            sign_factor SMALLINT,
            priority INTEGER,
            valid_from DATE,
            valid_to DATE,
            is_active BOOLEAN,
            notes VARCHAR
        )
        """
    )

    count = con.execute("SELECT COUNT(*) FROM vat_account_mapping").fetchone()[0]
    if count == 0:
        sample = pd.DataFrame(
            [
                [1, "__DEFAULT__", "44571", "COLLECTEE", "CREDIT", 1, 10, "2000-01-01", None, True, "TVA collectée"],
                [2, "__DEFAULT__", "44566", "DED_ABS", "DEBIT", 1, 10, "2000-01-01", None, True, "TVA déductible ABS"],
                [3, "__DEFAULT__", "44562", "DED_IMMO", "DEBIT", 1, 10, "2000-01-01", None, True, "TVA déductible immo"],
                [4, "__DEFAULT__", "4452", "DUE_AUTOLIQ", "CREDIT", 1, 20, "2000-01-01", None, True, "Autoliquidation due"],
                [5, "__DEFAULT__", "4452", "DED_AUTOLIQ", "DEBIT", 1, 21, "2000-01-01", None, True, "Autoliquidation déductible"],
                [6, "__DEFAULT__", "44567", "CREDIT_ANTERIEUR", "DEBIT", 1, 30, "2000-01-01", None, True, "Crédit antérieur"],
                [7, "__DEFAULT__", "44551", "TVA_A_DECAISSER", "CREDIT", 1, 40, "2000-01-01", None, True, "TVA à décaisser"],
                [8, "__DEFAULT__", "44558", "REGULARISATION_TVA", "NET", 1, 50, "2000-01-01", None, True, "Régularisation"],
            ],
            columns=[
                "mapping_id",
                "company_id",
                "account_prefix",
                "vat_category",
                "direction",
                "sign_factor",
                "priority",
                "valid_from",
                "valid_to",
                "is_active",
                "notes",
            ],
        )
        con.register("sample_mapping_df", sample)
        con.execute("INSERT INTO vat_account_mapping SELECT * FROM sample_mapping_df")


def build_context(con: duckdb.DuckDBPyConnection):
    if not table_exists(con, "vat_declarations"):
        raise ValueError("Table vat_declarations introuvable.")
    if not table_exists(con, "general_ledger"):
        raise ValueError("Table general_ledger introuvable.")

    vd_cols = table_columns(con, "vat_declarations")
    gl_cols = table_columns(con, "general_ledger")

    ctx = {
        "vd_company": pick_expr(vd_cols, ["company_id", "organization_id", "entity_id"]),
        "vd_form": pick_expr(vd_cols, ["form_type", "tax_form", "form_name"], "'TVA'"),
        "vd_period_start": pick_expr(vd_cols, ["period_start", "from_date", "fiscal_period_start"]),
        "vd_period_end": pick_expr(vd_cols, ["period_end", "to_date", "fiscal_period_end"]),
        "vd_declared": pick_expr(vd_cols, ["declared_amount", "net_vat_due", "amount_due", "vat_payable"], "0"),
        "vd_credit": pick_expr(vd_cols, ["declared_credit_amount", "vat_credit"], "0"),
        "vd_status": pick_expr(vd_cols, ["status"], "NULL"),
        "vd_id": pick_expr(vd_cols, ["declaration_id", "id"], "NULL"),
        "gl_company": pick_expr(gl_cols, ["company_id", "organization_id", "entity_id"]),
        "gl_date": pick_expr(gl_cols, ["entry_date", "accounting_date", "posting_date"]),
        "gl_account": pick_expr(gl_cols, ["account_number", "general_account_number"]),
        "gl_debit": pick_expr(gl_cols, ["debit"], "0"),
        "gl_credit": pick_expr(gl_cols, ["credit"], "0"),
        "gl_journal": pick_expr(gl_cols, ["journal_code", "journal_name"], "NULL"),
        "gl_entry_id": pick_expr(gl_cols, ["entry_id"], "NULL"),
        "gl_line_id": pick_expr(gl_cols, ["line_id"], "NULL"),
        "gl_entry_label": pick_expr(gl_cols, ["entry_label", "line_label"], "NULL"),
        "gl_piece": pick_expr(gl_cols, ["piece_number", "document_number"], "NULL"),
        "gl_invoice": pick_expr(gl_cols, ["invoice_number"], "NULL"),
        "gl_tier": pick_expr(gl_cols, ["customer_name", "third_party_name"], "'TIERS_NON_RENSEIGNE'"),
        "gl_tier_id": pick_expr(gl_cols, ["customer_id", "counterparty_id"], "NULL"),
    }

    missing = [k for k in ["vd_company", "vd_period_start", "vd_period_end", "gl_company", "gl_date", "gl_account"] if ctx[k] == "NULL"]
    if missing:
        raise ValueError(f"Colonnes minimales manquantes pour fonctionner: {missing}")

    return ctx


def run_cadrage(con, company_id: str, period_start: date, period_end: date, fiscal_year_start: date):
    ctx = build_context(con)

    con.execute("DROP VIEW IF EXISTS _vd")
    con.execute(
        f"""
        CREATE TEMP VIEW _vd AS
        SELECT
            {ctx['vd_company']}::VARCHAR AS company_id,
            {ctx['vd_id']}::VARCHAR AS declaration_id,
            {ctx['vd_form']}::VARCHAR AS form_type,
            CAST({ctx['vd_period_start']} AS DATE) AS period_start,
            CAST({ctx['vd_period_end']} AS DATE) AS period_end,
            CAST({ctx['vd_declared']} AS DOUBLE) AS declared_amount,
            CAST({ctx['vd_credit']} AS DOUBLE) AS declared_credit_amount,
            {ctx['vd_status']}::VARCHAR AS status
        FROM vat_declarations
        """
    )

    con.execute("DROP VIEW IF EXISTS _gl")
    con.execute(
        f"""
        CREATE TEMP VIEW _gl AS
        SELECT
            {ctx['gl_company']}::VARCHAR AS company_id,
            COALESCE({ctx['gl_entry_id']}::VARCHAR, 'NA') AS entry_id,
            COALESCE({ctx['gl_line_id']}::VARCHAR, md5(random()::VARCHAR)) AS line_id,
            CAST({ctx['gl_date']} AS DATE) AS entry_date,
            {ctx['gl_journal']}::VARCHAR AS journal_code,
            {ctx['gl_account']}::VARCHAR AS account_number,
            CAST({ctx['gl_debit']} AS DOUBLE) AS debit,
            CAST({ctx['gl_credit']} AS DOUBLE) AS credit,
            ({ctx['gl_debit']} - {ctx['gl_credit']})::DOUBLE AS net_amount,
            {ctx['gl_entry_label']}::VARCHAR AS entry_label,
            {ctx['gl_piece']}::VARCHAR AS piece_number,
            {ctx['gl_invoice']}::VARCHAR AS invoice_number,
            {ctx['gl_tier']}::VARCHAR AS tier_name,
            {ctx['gl_tier_id']}::VARCHAR AS tier_id
        FROM general_ledger
        """
    )

    declared_period = con.execute(
        """
        SELECT
            company_id,
            MIN(form_type) AS form_type,
            SUM(declared_amount) AS declared_amount_period
        FROM _vd
        WHERE company_id = ?
          AND period_start >= ?
          AND period_end <= ?
        GROUP BY 1
        """,
        [company_id, period_start, period_end],
    ).df()

    declared_ytd = con.execute(
        """
        SELECT
            company_id,
            SUM(declared_amount) AS declared_amount_ytd
        FROM _vd
        WHERE company_id = ?
          AND period_start >= ?
          AND period_end <= ?
        GROUP BY 1
        """,
        [company_id, fiscal_year_start, period_end],
    ).df()

    classified = con.execute(
        """
        WITH gl_vat AS (
            SELECT *
            FROM _gl
            WHERE company_id = ?
              AND entry_date BETWEEN ? AND ?
              AND account_number LIKE '445%'
        ),
        match_map AS (
            SELECT
                g.*,
                m.vat_category,
                m.direction,
                COALESCE(m.sign_factor, 1) AS sign_factor,
                ROW_NUMBER() OVER (
                    PARTITION BY g.line_id
                    ORDER BY COALESCE(m.priority, 999), LENGTH(COALESCE(m.account_prefix, '')) DESC
                ) AS rn
            FROM gl_vat g
            LEFT JOIN vat_account_mapping m
              ON m.is_active = TRUE
             AND (m.company_id = ? OR m.company_id = '__DEFAULT__')
             AND g.account_number LIKE m.account_prefix || '%'
             AND g.entry_date >= COALESCE(m.valid_from, DATE '1900-01-01')
             AND (m.valid_to IS NULL OR g.entry_date <= m.valid_to)
        )
        SELECT
            company_id, entry_id, line_id, entry_date, journal_code, account_number,
            debit, credit, net_amount, entry_label, piece_number, invoice_number,
            tier_id, tier_name,
            COALESCE(vat_category, 'UNMAPPED') AS vat_category,
            CASE
                WHEN direction = 'DEBIT' THEN debit
                WHEN direction = 'CREDIT' THEN credit
                ELSE net_amount
            END * sign_factor AS normalized_amount
        FROM match_map
        WHERE rn = 1 OR rn IS NULL
        """,
        [company_id, period_start, period_end, company_id],
    ).df()

    by_account = (
        classified.groupby("account_number", dropna=False)
        .agg(total_debit=("debit", "sum"), total_credit=("credit", "sum"), net_balance=("net_amount", "sum"))
        .reset_index()
        .sort_values("account_number")
    )

    by_category = (
        classified.groupby("vat_category", dropna=False)
        .agg(category_amount=("normalized_amount", "sum"))
        .reset_index()
        .sort_values("vat_category")
    )

    def cat(name):
        r = by_category.loc[by_category["vat_category"] == name, "category_amount"]
        return float(r.iloc[0]) if len(r) else 0.0

    vat_theoretical_period = (
        cat("COLLECTEE")
        - (cat("DED_ABS") + cat("DED_IMMO"))
        + cat("DUE_AUTOLIQ")
        - cat("DED_AUTOLIQ")
        - cat("CREDIT_ANTERIEUR")
        + cat("REGULARISATION_TVA")
    )

    classified_ytd = con.execute(
        """
        WITH gl_vat AS (
            SELECT *
            FROM _gl
            WHERE company_id = ?
              AND entry_date BETWEEN ? AND ?
              AND account_number LIKE '445%'
        ),
        match_map AS (
            SELECT
                g.*,
                m.vat_category,
                m.direction,
                COALESCE(m.sign_factor, 1) AS sign_factor,
                ROW_NUMBER() OVER (
                    PARTITION BY g.line_id
                    ORDER BY COALESCE(m.priority, 999), LENGTH(COALESCE(m.account_prefix, '')) DESC
                ) AS rn
            FROM gl_vat g
            LEFT JOIN vat_account_mapping m
              ON m.is_active = TRUE
             AND (m.company_id = ? OR m.company_id = '__DEFAULT__')
             AND g.account_number LIKE m.account_prefix || '%'
        )
        SELECT
            COALESCE(vat_category, 'UNMAPPED') AS vat_category,
            CASE
                WHEN direction = 'DEBIT' THEN debit
                WHEN direction = 'CREDIT' THEN credit
                ELSE net_amount
            END * sign_factor AS normalized_amount
        FROM match_map
        WHERE rn = 1 OR rn IS NULL
        """,
        [company_id, fiscal_year_start, period_end, company_id],
    ).df()

    cat_ytd = classified_ytd.groupby("vat_category", dropna=False)["normalized_amount"].sum().to_dict()
    vat_theoretical_ytd = (
        cat_ytd.get("COLLECTEE", 0.0)
        - (cat_ytd.get("DED_ABS", 0.0) + cat_ytd.get("DED_IMMO", 0.0))
        + cat_ytd.get("DUE_AUTOLIQ", 0.0)
        - cat_ytd.get("DED_AUTOLIQ", 0.0)
        - cat_ytd.get("CREDIT_ANTERIEUR", 0.0)
        + cat_ytd.get("REGULARISATION_TVA", 0.0)
    )

    declared_amount_period = float(declared_period["declared_amount_period"].iloc[0]) if not declared_period.empty else 0.0
    declared_amount_ytd = float(declared_ytd["declared_amount_ytd"].iloc[0]) if not declared_ytd.empty else 0.0
    form_type = declared_period["form_type"].iloc[0] if not declared_period.empty else "N/A"

    anomalies = classified.copy()
    anomalies["issue_code"] = "OK"
    anomalies.loc[anomalies["vat_category"] == "UNMAPPED", "issue_code"] = "UNMAPPED_445"
    anomalies.loc[(anomalies["journal_code"].fillna("") == "OD") & (anomalies["net_amount"].abs() >= 1000), "issue_code"] = "OD_HIGH_RISK"
    anomalies.loc[(anomalies["account_number"].str.startswith("44571")) & (anomalies["debit"] > anomalies["credit"]), "issue_code"] = "COLLECTEE_SIGN_INVERTED"
    anomalies.loc[(anomalies["account_number"].str.startswith("44566")) & (anomalies["credit"] > anomalies["debit"]), "issue_code"] = "DEDUCTIBLE_SIGN_INVERTED"
    anomalies.loc[(anomalies["invoice_number"].isna()) & (anomalies["net_amount"].abs() > 500), "issue_code"] = "NO_INVOICE_REFERENCE"

    score_map = {
        "UNMAPPED_445": 100,
        "OD_HIGH_RISK": 90,
        "COLLECTEE_SIGN_INVERTED": 85,
        "DEDUCTIBLE_SIGN_INVERTED": 85,
        "NO_INVOICE_REFERENCE": 70,
        "OK": 0,
    }
    anomalies["anomaly_score"] = anomalies["issue_code"].map(score_map).fillna(50)
    anomalies = anomalies[anomalies["issue_code"] != "OK"].sort_values(["anomaly_score", "net_amount"], ascending=[False, False])

    client_analysis = (
        classified[classified["account_number"].str.startswith("44571", na=False)]
        .groupby(["tier_id", "tier_name"], dropna=False)["normalized_amount"]
        .sum()
        .reset_index(name="vat_collectee_period")
        .sort_values("vat_collectee_period", ascending=False)
    )
    if not client_analysis.empty:
        total = client_analysis["vat_collectee_period"].sum()
        client_analysis["share_pct"] = (100 * client_analysis["vat_collectee_period"] / total).round(2)

    summary = pd.DataFrame(
        [
            {
                "company_id": company_id,
                "period_start": period_start,
                "period_end": period_end,
                "fiscal_year_start": fiscal_year_start,
                "form_type": form_type,
                "declared_amount_period": declared_amount_period,
                "vat_theoretical_period": vat_theoretical_period,
                "cadrage_gap_period": declared_amount_period - vat_theoretical_period,
                "declared_amount_ytd": declared_amount_ytd,
                "vat_theoretical_ytd": vat_theoretical_ytd,
                "cadrage_gap_ytd": declared_amount_ytd - vat_theoretical_ytd,
                "anomaly_count_line_level": int(len(anomalies)),
                "anomaly_amount_line_level": float(anomalies["net_amount"].abs().sum()) if not anomalies.empty else 0.0,
            }
        ]
    )

    return summary, by_category, by_account, anomalies, client_analysis, classified


def df_to_excel_bytes(sheets: dict[str, pd.DataFrame]) -> bytes:
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        for sheet_name, df in sheets.items():
            df.to_excel(writer, index=False, sheet_name=sheet_name[:31])
    return output.getvalue()


# ---------- UI ----------
st.title("📊 Cadrage TVA Cabinet – Exécutable")
st.caption("Ouverture dossier, cadrage période + YTD, anomalies ligne à ligne, export Excel.")

with st.sidebar:
    st.header("Connexion")
    db_path = st.text_input("Chemin DuckDB", value="cadrage_tva.duckdb")
    connect_btn = st.button("Ouvrir le dossier")

if "con" not in st.session_state:
    st.session_state.con = None

if connect_btn:
    try:
        con = duckdb.connect(db_path)
        ensure_mapping_table(con)
        st.session_state.con = con
        st.success(f"Dossier ouvert : {db_path}")
    except Exception as e:
        st.error(f"Impossible d'ouvrir le dossier : {e}")

con = st.session_state.con
if con is None:
    st.info("Ouvrez un dossier DuckDB pour lancer le cadrage.")
    st.stop()

required = ["vat_declarations", "general_ledger"]
missing = [t for t in required if not table_exists(con, t)]
if missing:
    st.error(f"Tables manquantes : {missing}. Vous devez charger ces tables dans le dossier.")
    st.stop()

ctx = build_context(con)
company_df = con.execute(f"SELECT DISTINCT {ctx['vd_company']}::VARCHAR AS company_id FROM vat_declarations ORDER BY 1").df()
if company_df.empty:
    st.warning("Aucune société trouvée dans vat_declarations.")
    st.stop()

col1, col2, col3, col4 = st.columns(4)
company_id = col1.selectbox("Société", company_df["company_id"].tolist())
period_start = col2.date_input("Début période", value=date.today().replace(day=1))
period_end = col3.date_input("Fin période", value=date.today())
fiscal_year_start = col4.date_input("Ouverture exercice", value=date(date.today().year, 1, 1))

if period_start > period_end:
    st.error("La date de début période doit être <= fin période.")
    st.stop()
if fiscal_year_start > period_end:
    st.error("L'ouverture d'exercice doit être <= fin période.")
    st.stop()

if st.button("Lancer le cadrage", type="primary"):
    try:
        summary, by_category, by_account, anomalies, client_analysis, classified = run_cadrage(
            con=con,
            company_id=company_id,
            period_start=period_start,
            period_end=period_end,
            fiscal_year_start=fiscal_year_start,
        )

        st.subheader("Synthèse")
        st.dataframe(summary, use_container_width=True)

        k1, k2, k3 = st.columns(3)
        k1.metric("Écart période", f"{summary.at[0, 'cadrage_gap_period']:.2f}")
        k2.metric("Écart YTD", f"{summary.at[0, 'cadrage_gap_ytd']:.2f}")
        k3.metric("Anomalies lignes", int(summary.at[0, 'anomaly_count_line_level']))

        st.subheader("Détail par catégorie TVA")
        st.dataframe(by_category, use_container_width=True)

        st.subheader("Détail par compte 445")
        st.dataframe(by_account, use_container_width=True)

        st.subheader("Anomalies ligne à ligne")
        st.dataframe(anomalies, use_container_width=True, height=350)

        st.subheader("Analyse clients (TVA collectée)")
        st.dataframe(client_analysis, use_container_width=True)

        st.subheader("Données classifiées (audit)")
        st.dataframe(classified, use_container_width=True, height=250)

        excel_data = df_to_excel_bytes(
            {
                "Summary": summary,
                "ByCategory": by_category,
                "ByAccount445": by_account,
                "Anomalies": anomalies,
                "ClientAnalysis": client_analysis,
                "ClassifiedLines": classified,
            }
        )
        st.download_button(
            label="📥 Export Excel du cadrage",
            data=excel_data,
            file_name=f"cadrage_tva_{company_id}_{period_end}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    except Exception as e:
        st.exception(e)

st.markdown("---")
st.caption("Conseil: chargez `tax_declarations` si disponible pour enrichir le statut/paiement en sortie.")
