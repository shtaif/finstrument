import axios from 'axios';

export { axiosGqlClient };

const axiosGqlClient = axios.create({
  baseURL: `http://localhost:${process.env.PORT}/graphql`,
  method: 'post',
});
