"""One-time, deterministic extraction. Original static files are never changed."""
from pathlib import Path
import re,json,shutil
ROOT=Path(__file__).resolve().parents[1]
pages=json.loads((ROOT/'docs/legacy-audit.json').read_text(encoding='utf-8'))
target=ROOT/'src/features/content';target.mkdir(parents=True,exist_ok=True)
result={}
for page in pages:
    source=(ROOT/page['file']).read_text(encoding='utf-8')
    body=re.search(r'<main id="main">(.*?)</main>',source,re.S)[1]
    body=re.sub(r'<form class="form-panel".*?</form>','<!--CONSULTATION_FORM-->',body,flags=re.S)
    body=re.sub(r'<input id="document-files"[^>]*>','<input id="document-files" type="file" disabled hidden aria-disabled="true">',body)
    body=body.replace('点击选择资料文件','资料上传尚未开通').replace('尚未选择文件','资料上传尚未开通；请勿发送征信、流水或身份证明文件。')
    body=body.replace('这里可以选择文件检查格式与大小，但不会上传到服务器，也不会进行实际评估。','资料上传尚未开通。本阶段仅提供预审流程与清单说明，不接收、保存或评估文件。').replace('选择资料文件（仅本地检查）','资料上传尚未开通').replace('支持 JPG、PNG、PDF，单个文件不超过 10MB','请勿在此提交征信、流水、财报或身份证明文件')
    if page['route']=='/contact/':
        body=body.replace('填写基本信息，查看表单交互演示。','填写基本信息，授权我们为本次融资咨询联系您。')
        body=body.replace('当前为网站演示版','咨询服务说明').replace('为保护个人信息，咨询表单暂未连接后台，请勿填写真实敏感资料。部署前需配置正式联系方式与安全接收接口。','咨询入口仅在安全接收服务和隐私公示配置完成后开放。请勿填写身份证号、征信、银行账户或流水等敏感资料。')
    if page['route']=='/privacy/':
        body='''<section class="page-banner"><div class="shell"><div class="eyebrow">PRIVACY / HUSHANGYIN</div><h1>隐私政策</h1><p>咨询信息处理说明 · 版本 2026-10-28-v1</p></div></section><section class="section shell narrow-copy"><h2>咨询信息与授权</h2><p>咨询入口开通后，我们仅为响应本次融资咨询，处理您主动填写的称呼、电话、客户类型、融资需求及补充说明，并记录同意状态、政策版本、来源页面和提交时间。请勿填写身份证号、银行账户、征信记录或其他非必要敏感资料。</p><h2>存储与访问</h2><p>咨询信息保存在受权限限制的数据库中，仅获授权的业务管理员可访问。默认建议未转化线索在最后更新后180天由运营审核删除或匿名化；授权与审计记录按实际适用要求另行确定留存期限。不会向未批准的第三方AI服务发送资料，不用于自动授信。</p><h2>资料上传尚未开通</h2><p>本站不接收或保存征信报告、银行流水、财报及身份证明文件。预审页仅提供流程说明。</p><h2>您的权利及服务开通条件</h2><p>您可以申请查询、更正、撤回同意或删除咨询信息。正式开放咨询前，运营方必须在本页补齐真实个人信息处理者名称、联系方式、权利申请渠道、具体留存期限及委托处理说明，并完成安全配置。当前尚未补齐时咨询入口保持关闭。</p></section>'''
    assert not re.search(r'<script|\son\w+=',body,re.I)
    result[page['route']]={'title':page['title'],'description':page['description'],'html':body}
(target/'legacy-pages.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
assets=ROOT/'public/assets';assets.mkdir(parents=True,exist_ok=True)
for name in ['style.css','navigation.css','favicon.svg']:shutil.copyfile(ROOT/'assets'/name,assets/name)
print('Extracted 15 pages and preserved assets; originals unchanged.')
