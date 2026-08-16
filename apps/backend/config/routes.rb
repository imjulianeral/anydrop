Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :sessions, only: :create
      resource :device, only: :update
      resources :peers, only: :index
      resources :transfers, only: [ :create, :show ] do
        post :complete, on: :member
      end
      resources :local_blobs, only: [ :show, :update ], param: :key, constraints: { key: /.*/ }
    end
  end

  namespace :internal do
    post :expire, to: "expire#create"
  end
end
