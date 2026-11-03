const lending = {
  title: "国家金融监督管理总局《流动资金贷款管理办法》",
  href: "https://www.nfra.gov.cn/cn/view/pages/governmentDetail.html?docId=1151066",
};
const credit = {
  title: "中国人民银行征信中心：个人信用报告及异议权利",
  href: "https://www.pbccrc.org.cn/zxfw/gr/bg/20210701/6ad6f4bb659acc3c652d5db9ab83a0ef.html",
};
const cashflow = {
  title: "财政部《企业会计准则第31号——现金流量表》",
  href: "https://kjs.mof.gov.cn/zt/kjzzss/kuaijizhunzeshishi/200806/t20080618_46250.htm",
};
export const articleSources: Record<string, { title: string; href: string }[]> =
  {
    "/insights/enterprise-loan-guide/": [lending, credit],
    "/insights/credit-report-check/": [credit],
    "/insights/cash-flow-vs-profit/": [cashflow, lending],
    "/insights/mortgage-business-loan/": [lending],
  };
