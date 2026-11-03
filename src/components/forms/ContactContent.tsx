import { ConsultationForm } from "./ConsultationForm";
export function ContactContent({
  available,
  localTestMode = false,
  sourceArticleId,
  sourceFaqId,
  attributionToken,
  sourceParameters,
}: {
  available: boolean;
  localTestMode?: boolean;
  sourceArticleId?: string;
  sourceFaqId?: string;
  attributionToken?: string;
  sourceParameters?: Record<string, string>;
}) {
  return (
    <>
      {localTestMode && (
        <aside className="notice shell" role="note">
          本地测试入口：仅限虚构咨询数据，不接收真实客户资料。
        </aside>
      )}
      <section className="page-banner">
        <div className="shell">
          <div className="eyebrow">CONTACT US / HUSHANGYIN</div>
          <h1>聊聊您的融资需求。</h1>
          <p>告诉我们您的基本情况，从问题诊断开始，而不是盲目寻找贷款。</p>
        </div>
        <div className="banner-lines" />
      </section>
      <section className="section shell">
        <div className="contact-layout">
          <div>
            <div className="eyebrow dark">GET IN TOUCH</div>
            <h2>以专业，回应每一次信任。</h2>
            <p className="lead">
              服务区域：上海及周边地区。正式联系电话、企业微信和办公地点将在资料核验后开放展示。
            </p>
            <div className="contact-info">
              <div>
                <span>01 / 服务内容</span>
                <b>融资咨询 · 资料梳理 · 风险初评</b>
              </div>
              <div>
                <span>02 / 服务区域</span>
                <b>上海及周边地区</b>
              </div>
              <div>
                <span>03 / 联系方式</span>
                <b>待配置真实电话及企业微信</b>
              </div>
            </div>
            <div className="notice">
              <b>咨询服务说明</b>
              <p>
                咨询入口仅在安全接收服务和隐私公示配置完成后开放。请勿填写身份证号、征信、银行账户或流水等敏感资料。
              </p>
            </div>
          </div>
          <div>
            <div className="form-intro">
              <h3>预约融资咨询</h3>
              <p>填写基本信息，授权我们为本次融资咨询联系您。</p>
            </div>
            <ConsultationForm
              available={available}
              sourceArticleId={sourceArticleId}
              sourceFaqId={sourceFaqId}
              attributionToken={attributionToken}
              sourceParameters={sourceParameters}
            />
          </div>
        </div>
      </section>
    </>
  );
}
