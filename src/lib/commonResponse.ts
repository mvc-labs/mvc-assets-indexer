export const commonResponse = (code: number, msg: string, data: any) => {
  return {
    code: code,
    msg: msg,
    data: data,
  };
};
